/**
 * Cross-File Relationship Resolver
 * Resolves symbols and relationships across multiple files in a project
 */

import path from 'path';
import { CodeEntity, CodeRelationship, CodeEntityType, CodeRelationshipType } from './code-analyzer.js';
import { Result } from '../types/index.js';
import { toKBError } from '../types/error-utils.js';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectContext {
  entities: Map<string, CodeEntity>; // entityId -> entity
  entitiesByFile: Map<string, CodeEntity[]>; // filePath -> entities
  entitiesByName: Map<string, CodeEntity[]>; // name -> entities (multiple files may have same name)
  exportMap: Map<string, ExportInfo[]>; // filePath -> exports
  importMap: Map<string, ImportInfo[]>; // filePath -> imports
  relationships: Map<string, CodeRelationship>; // relationshipId -> relationship
  fileGraph: Map<string, string[]>; // filePath -> dependent files
}

export interface ExportInfo {
  name: string;
  entity: CodeEntity;
  isDefault: boolean;
  alias?: string;
  filePath: string;
}

export interface ImportInfo {
  source: string;
  resolvedPath: string;
  specifiers: ImportSpecifier[];
  defaultImport?: string;
  namespaceImport?: string;
  filePath: string;
  isExternal: boolean;
}

export interface ImportSpecifier {
  name: string;
  alias?: string;
  imported: string;
}

export interface ResolutionResult {
  resolved: CodeRelationship[];
  unresolved: UnresolvedReference[];
  crossFileRelationships: CodeRelationship[];
}

export interface UnresolvedReference {
  symbolName: string;
  filePath: string;
  line: number;
  context: string;
  reason: string;
}

export class CrossFileResolver {
  private projectContext: ProjectContext;
  private projectRoot: string;
  private fileExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.projectContext = {
      entities: new Map(),
      entitiesByFile: new Map(),
      entitiesByName: new Map(),
      exportMap: new Map(),
      importMap: new Map(),
      relationships: new Map(),
      fileGraph: new Map()
    };
  }

  /**
   * Add entities from a file to the project context
   */
  addFileEntities(filePath: string, entities: CodeEntity[]): void {
    // Normalize file path
    const normalizedPath = this.normalizePath(filePath);
    
    // Store entities
    this.projectContext.entitiesByFile.set(normalizedPath, entities);
    
    for (const entity of entities) {
      this.projectContext.entities.set(entity.id, entity);
      
      // Group by name for lookup
      if (!this.projectContext.entitiesByName.has(entity.name)) {
        this.projectContext.entitiesByName.set(entity.name, []);
      }
      this.projectContext.entitiesByName.get(entity.name)!.push(entity);
    }

    // Extract exports and imports
    this.extractExports(normalizedPath, entities);
    this.extractImports(normalizedPath, entities);
  }

  /**
   * Resolve all cross-file relationships
   */
  async resolveAllRelationships(): Promise<Result<ResolutionResult>> {
    try {
      const resolved: CodeRelationship[] = [];
      const unresolved: UnresolvedReference[] = [];
      const crossFileRelationships: CodeRelationship[] = [];

      // Build file dependency graph first
      await this.buildFileDependencyGraph();

      // Resolve import-export relationships
      const importExportResults = await this.resolveImportExportRelationships();
      resolved.push(...importExportResults.resolved);
      unresolved.push(...importExportResults.unresolved);
      crossFileRelationships.push(...importExportResults.crossFileRelationships);

      // Resolve function call relationships across files
      const callResults = await this.resolveCrossFileCallRelationships();
      resolved.push(...callResults.resolved);
      unresolved.push(...callResults.unresolved);
      crossFileRelationships.push(...callResults.crossFileRelationships);

      // Resolve inheritance relationships across files
      const inheritanceResults = await this.resolveCrossFileInheritanceRelationships();
      resolved.push(...inheritanceResults.resolved);
      unresolved.push(...inheritanceResults.unresolved);
      crossFileRelationships.push(...inheritanceResults.crossFileRelationships);

      // Resolve type usage relationships
      const typeResults = await this.resolveCrossFileTypeRelationships();
      resolved.push(...typeResults.resolved);
      unresolved.push(...typeResults.unresolved);
      crossFileRelationships.push(...typeResults.crossFileRelationships);

      return {
        success: true,
        data: {
          resolved,
          unresolved,
          crossFileRelationships
        }
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: 'resolveAllRelationships' })
      };
    }
  }

  /**
   * Resolve import-export relationships
   */
  private async resolveImportExportRelationships(): Promise<ResolutionResult> {
    const resolved: CodeRelationship[] = [];
    const unresolved: UnresolvedReference[] = [];
    const crossFileRelationships: CodeRelationship[] = [];

    for (const [filePath, imports] of this.projectContext.importMap) {
      for (const importInfo of imports) {
        try {
          // Resolve the import source to actual file
          const resolvedPath = await this.resolveModulePath(importInfo.source, filePath);
          
          if (!resolvedPath) {
            unresolved.push({
              symbolName: importInfo.source,
              filePath,
              line: 0,
              context: 'import',
              reason: 'Module not found'
            });
            continue;
          }

          // Update import info with resolved path
          importInfo.resolvedPath = resolvedPath;
          importInfo.isExternal = !this.isLocalModule(resolvedPath);

          // Find exports in the target module
          const targetExports = this.projectContext.exportMap.get(resolvedPath) || [];

          // Create dependency relationship between files
          crossFileRelationships.push({
            id: uuidv4(),
            sourceId: this.getFileEntityId(filePath),
            targetId: this.getFileEntityId(resolvedPath),
            type: CodeRelationshipType.DEPENDS_ON,
            filePath,
            line: 0,
            metadata: {
              dependencyType: 'import',
              source: importInfo.source,
              resolvedPath
            }
          });

          // Resolve each import specifier
          for (const specifier of importInfo.specifiers) {
            const targetExport = targetExports.find(exp => 
              exp.name === specifier.imported || 
              (exp.isDefault && specifier.imported === 'default')
            );

            if (targetExport) {
              resolved.push({
                id: uuidv4(),
                sourceId: this.getImportEntityId(filePath, importInfo.source),
                targetId: targetExport.entity.id,
                type: CodeRelationshipType.IMPORTS,
                filePath,
                line: 0,
                metadata: {
                  importedName: specifier.imported,
                  localName: specifier.alias || specifier.name,
                  isDefault: targetExport.isDefault,
                  resolvedPath
                }
              });
            } else {
              unresolved.push({
                symbolName: specifier.imported,
                filePath,
                line: 0,
                context: 'import_specifier',
                reason: `Export '${specifier.imported}' not found in module '${importInfo.source}'`
              });
            }
          }

          // Handle default import
          if (importInfo.defaultImport) {
            const defaultExport = targetExports.find(exp => exp.isDefault);
            if (defaultExport) {
              resolved.push({
                id: uuidv4(),
                sourceId: this.getImportEntityId(filePath, importInfo.source),
                targetId: defaultExport.entity.id,
                type: CodeRelationshipType.IMPORTS,
                filePath,
                line: 0,
                metadata: {
                  importedName: 'default',
                  localName: importInfo.defaultImport,
                  isDefault: true,
                  resolvedPath
                }
              });
            }
          }

          // Handle namespace import
          if (importInfo.namespaceImport) {
            // Create relationship to the module itself
            resolved.push({
              id: uuidv4(),
              sourceId: this.getImportEntityId(filePath, importInfo.source),
              targetId: this.getModuleEntityId(resolvedPath),
              type: CodeRelationshipType.IMPORTS,
              filePath,
              line: 0,
              metadata: {
                importedName: '*',
                localName: importInfo.namespaceImport,
                isNamespace: true,
                resolvedPath
              }
            });
          }
        } catch (error) {
          unresolved.push({
            symbolName: importInfo.source,
            filePath,
            line: 0,
            context: 'import_resolution',
            reason: `Error resolving import: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    }

    return { resolved, unresolved, crossFileRelationships };
  }

  /**
   * Resolve cross-file function call relationships
   */
  private async resolveCrossFileCallRelationships(): Promise<ResolutionResult> {
    const resolved: CodeRelationship[] = [];
    const unresolved: UnresolvedReference[] = [];
    const crossFileRelationships: CodeRelationship[] = [];

    // Find all function call relationships that might be cross-file
    for (const relationship of this.projectContext.relationships.values()) {
      if (relationship.type === CodeRelationshipType.CALLS) {
        const sourceEntity = this.projectContext.entities.get(relationship.sourceId);
        const targetEntity = this.projectContext.entities.get(relationship.targetId);

        if (!sourceEntity || !targetEntity) continue;

        // If target is external or placeholder, try to resolve it
        if (targetEntity.filePath === 'external' || targetEntity.metadata.isExternal) {
          const resolvedTarget = await this.resolveExternalFunctionCall(
            targetEntity.name,
            sourceEntity.filePath
          );

          if (resolvedTarget) {
            // Update the relationship to point to the resolved target
            relationship.targetId = resolvedTarget.id;
            resolved.push(relationship);

            // Add cross-file relationship if different files
            if (sourceEntity.filePath !== resolvedTarget.filePath) {
              crossFileRelationships.push({
                id: uuidv4(),
                sourceId: this.getFileEntityId(sourceEntity.filePath),
                targetId: this.getFileEntityId(resolvedTarget.filePath),
                type: CodeRelationshipType.DEPENDS_ON,
                filePath: sourceEntity.filePath,
                line: relationship.line,
                metadata: {
                  dependencyType: 'function_call',
                  calledFunction: targetEntity.name
                }
              });
            }
          } else {
            unresolved.push({
              symbolName: targetEntity.name,
              filePath: sourceEntity.filePath,
              line: relationship.line,
              context: 'function_call',
              reason: 'Function definition not found'
            });
          }
        }
      }
    }

    return { resolved, unresolved, crossFileRelationships };
  }

  /**
   * Resolve cross-file inheritance relationships
   */
  private async resolveCrossFileInheritanceRelationships(): Promise<ResolutionResult> {
    const resolved: CodeRelationship[] = [];
    const unresolved: UnresolvedReference[] = [];
    const crossFileRelationships: CodeRelationship[] = [];

    // Similar logic for inheritance relationships
    for (const relationship of this.projectContext.relationships.values()) {
      if (relationship.type === CodeRelationshipType.INHERITS || 
          relationship.type === CodeRelationshipType.IMPLEMENTS) {
        
        const sourceEntity = this.projectContext.entities.get(relationship.sourceId);
        const targetEntity = this.projectContext.entities.get(relationship.targetId);

        if (!sourceEntity || !targetEntity) continue;

        if (targetEntity.filePath === 'external' || targetEntity.metadata.isExternal) {
          const resolvedTarget = await this.resolveExternalType(
            targetEntity.name,
            sourceEntity.filePath
          );

          if (resolvedTarget) {
            relationship.targetId = resolvedTarget.id;
            resolved.push(relationship);

            if (sourceEntity.filePath !== resolvedTarget.filePath) {
              crossFileRelationships.push({
                id: uuidv4(),
                sourceId: this.getFileEntityId(sourceEntity.filePath),
                targetId: this.getFileEntityId(resolvedTarget.filePath),
                type: CodeRelationshipType.DEPENDS_ON,
                filePath: sourceEntity.filePath,
                line: relationship.line,
                metadata: {
                  dependencyType: relationship.type,
                  typeName: targetEntity.name
                }
              });
            }
          } else {
            unresolved.push({
              symbolName: targetEntity.name,
              filePath: sourceEntity.filePath,
              line: relationship.line,
              context: relationship.type,
              reason: 'Type definition not found'
            });
          }
        }
      }
    }

    return { resolved, unresolved, crossFileRelationships };
  }

  /**
   * Resolve cross-file type relationships
   */
  private async resolveCrossFileTypeRelationships(): Promise<ResolutionResult> {
    const resolved: CodeRelationship[] = [];
    const unresolved: UnresolvedReference[] = [];
    const crossFileRelationships: CodeRelationship[] = [];

    // Handle type references in function parameters, return types, etc.
    for (const entity of this.projectContext.entities.values()) {
      if (entity.type === CodeEntityType.FUNCTION) {
        // Check parameter types and return types
        const parameterTypes = this.extractTypesFromSignature(entity.signature || '');
        
        for (const typeName of parameterTypes) {
          const resolvedType = await this.resolveType(typeName, entity.filePath);
          
          if (resolvedType && resolvedType.filePath !== entity.filePath) {
            crossFileRelationships.push({
              id: uuidv4(),
              sourceId: entity.id,
              targetId: resolvedType.id,
              type: CodeRelationshipType.USES,
              filePath: entity.filePath,
              line: entity.line,
              metadata: {
                usageType: 'parameter_type',
                typeName
              }
            });

            // File-level dependency
            crossFileRelationships.push({
              id: uuidv4(),
              sourceId: this.getFileEntityId(entity.filePath),
              targetId: this.getFileEntityId(resolvedType.filePath),
              type: CodeRelationshipType.DEPENDS_ON,
              filePath: entity.filePath,
              line: entity.line,
              metadata: {
                dependencyType: 'type_usage',
                typeName
              }
            });
          }
        }
      }
    }

    return { resolved, unresolved, crossFileRelationships };
  }

  // Helper methods

  private extractExports(filePath: string, entities: CodeEntity[]): void {
    const exports: ExportInfo[] = [];
    
    for (const entity of entities) {
      if (entity.type === CodeEntityType.EXPORT) {
        exports.push({
          name: entity.metadata.name || entity.name,
          entity,
          isDefault: entity.metadata.isDefault || false,
          alias: entity.metadata.alias,
          filePath
        });
      }
      
      // Also check for exported functions, classes, etc.
      if (entity.metadata.isExported) {
        exports.push({
          name: entity.name,
          entity,
          isDefault: entity.metadata.isDefaultExport || false,
          filePath
        });
      }
    }
    
    this.projectContext.exportMap.set(filePath, exports);
  }

  private extractImports(filePath: string, entities: CodeEntity[]): void {
    const imports: ImportInfo[] = [];
    
    for (const entity of entities) {
      if (entity.type === CodeEntityType.IMPORT) {
        imports.push({
          source: entity.metadata.source,
          resolvedPath: '', // Will be resolved later
          specifiers: entity.metadata.specifiers || [],
          defaultImport: entity.metadata.defaultImport,
          namespaceImport: entity.metadata.namespaceImport,
          filePath,
          isExternal: false // Will be determined during resolution
        });
      }
    }
    
    this.projectContext.importMap.set(filePath, imports);
  }

  private async buildFileDependencyGraph(): Promise<void> {
    // Build a graph of file dependencies based on imports
    for (const [filePath, imports] of this.projectContext.importMap) {
      const dependencies: string[] = [];
      
      for (const importInfo of imports) {
        const resolvedPath = await this.resolveModulePath(importInfo.source, filePath);
        if (resolvedPath && this.isLocalModule(resolvedPath)) {
          dependencies.push(resolvedPath);
        }
      }
      
      this.projectContext.fileGraph.set(filePath, dependencies);
    }
  }

  private async resolveModulePath(source: string, fromFile: string): Promise<string | null> {
    // Handle relative imports
    if (source.startsWith('./') || source.startsWith('../')) {
      return this.resolveRelativePath(source, fromFile);
    }
    
    // Handle absolute imports from project root
    if (source.startsWith('/')) {
      return path.join(this.projectRoot, source);
    }
    
    // Handle node_modules or external packages
    if (!source.startsWith('.')) {
      // Try to find in project (might be an alias or monorepo package)
      const projectPath = this.resolveProjectPath(source, fromFile);
      if (projectPath) return projectPath;
      
      // External package
      return null;
    }
    
    return null;
  }

  private resolveRelativePath(source: string, fromFile: string): string {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, source);
    
    // Try with different extensions
    for (const ext of this.fileExtensions) {
      const withExt = resolved + ext;
      if (this.projectContext.entitiesByFile.has(withExt)) {
        return withExt;
      }
    }
    
    // Try as directory with index file
    for (const ext of this.fileExtensions) {
      const indexPath = path.join(resolved, 'index' + ext);
      if (this.projectContext.entitiesByFile.has(indexPath)) {
        return indexPath;
      }
    }
    
    return resolved;
  }

  private resolveProjectPath(source: string, fromFile: string): string | null {
    // Simple implementation - could be enhanced with tsconfig path mapping
    const possiblePaths = [
      path.join(this.projectRoot, 'src', source),
      path.join(this.projectRoot, source)
    ];
    
    for (const basePath of possiblePaths) {
      for (const ext of this.fileExtensions) {
        const withExt = basePath + ext;
        if (this.projectContext.entitiesByFile.has(withExt)) {
          return withExt;
        }
      }
    }
    
    return null;
  }

  private isLocalModule(path: string): boolean {
    return path.startsWith(this.projectRoot) || path.startsWith('./') || path.startsWith('../');
  }

  private async resolveExternalFunctionCall(functionName: string, fromFile: string): Promise<CodeEntity | null> {
    // Look for function in imported modules
    const imports = this.projectContext.importMap.get(fromFile) || [];
    
    for (const importInfo of imports) {
      if (importInfo.resolvedPath) {
        const targetEntities = this.projectContext.entitiesByFile.get(importInfo.resolvedPath) || [];
        
        // Check direct imports
        for (const spec of importInfo.specifiers) {
          if (spec.alias === functionName || spec.name === functionName) {
            const targetEntity = targetEntities.find(e => e.name === spec.imported);
            if (targetEntity) return targetEntity;
          }
        }
        
        // Check default import
        if (importInfo.defaultImport === functionName) {
          const defaultEntity = targetEntities.find(e => e.metadata.isDefault);
          if (defaultEntity) return defaultEntity;
        }
        
        // Check namespace import
        if (importInfo.namespaceImport && functionName.startsWith(importInfo.namespaceImport + '.')) {
          const memberName = functionName.substring(importInfo.namespaceImport.length + 1);
          const memberEntity = targetEntities.find(e => e.name === memberName);
          if (memberEntity) return memberEntity;
        }
      }
    }
    
    return null;
  }

  private async resolveExternalType(typeName: string, fromFile: string): Promise<CodeEntity | null> {
    return this.resolveExternalFunctionCall(typeName, fromFile); // Similar logic
  }

  private async resolveType(typeName: string, fromFile: string): Promise<CodeEntity | null> {
    // First check local file
    const localEntities = this.projectContext.entitiesByFile.get(fromFile) || [];
    const localType = localEntities.find(e => 
      e.name === typeName && 
      (e.type === CodeEntityType.TYPE || e.type === CodeEntityType.INTERFACE || e.type === CodeEntityType.CLASS)
    );
    
    if (localType) return localType;
    
    // Then check imported types
    return this.resolveExternalType(typeName, fromFile);
  }

  private extractTypesFromSignature(signature: string): string[] {
    // Simple regex-based type extraction - could be improved
    const typeRegex = /:\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
    const types: string[] = [];
    let match;
    
    while ((match = typeRegex.exec(signature)) !== null) {
      types.push(match[1]);
    }
    
    return types;
  }

  private normalizePath(filePath: string): string {
    return path.resolve(filePath);
  }

  private getFileEntityId(filePath: string): string {
    return `file_${filePath}`;
  }

  private getImportEntityId(filePath: string, source: string): string {
    return `import_${filePath}_${source}`;
  }

  private getModuleEntityId(filePath: string): string {
    return `module_${filePath}`;
  }

  /**
   * Get project statistics
   */
  getProjectStats(): {
    totalFiles: number;
    totalEntities: number;
    totalRelationships: number;
    entitiesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
    unresolvedCount: number;
  } {
    const entitiesByType: Record<string, number> = {};
    const relationshipsByType: Record<string, number> = {};

    for (const entity of this.projectContext.entities.values()) {
      entitiesByType[entity.type] = (entitiesByType[entity.type] || 0) + 1;
    }

    for (const relationship of this.projectContext.relationships.values()) {
      relationshipsByType[relationship.type] = (relationshipsByType[relationship.type] || 0) + 1;
    }

    return {
      totalFiles: this.projectContext.entitiesByFile.size,
      totalEntities: this.projectContext.entities.size,
      totalRelationships: this.projectContext.relationships.size,
      entitiesByType,
      relationshipsByType,
      unresolvedCount: 0 // Would track unresolved references
    };
  }
}