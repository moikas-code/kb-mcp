/**
 * Relationship Extractor
 * Extracts relationships between code entities (calls, imports, inheritance, etc.)
 */

import Parser from 'tree-sitter';
import { v4 as uuidv4 } from 'uuid';
import { CodeEntity, CodeRelationship, CodeRelationshipType } from '../code-analyzer.js';
import { TypeScriptParser, ParsedAST } from '../parsers/typescript-parser.js';
import { Result } from '../../types/index.js';
import { toKBError } from '../../types/error-utils.js';

export interface RelationshipExtractionOptions {
  includeInternalCalls?: boolean;
  includeTestRelationships?: boolean;
  maxDepth?: number;
  resolveExternalImports?: boolean;
}

export interface ImportResolution {
  importPath: string;
  resolvedPath: string;
  isExternal: boolean;
  isRelative: boolean;
}

export class RelationshipExtractor {
  private tsParser: TypeScriptParser;
  private entityMap: Map<string, CodeEntity> = new Map();
  private symbolTable: Map<string, Map<string, CodeEntity>> = new Map(); // file -> symbol -> entity

  constructor() {
    this.tsParser = new TypeScriptParser();
  }

  /**
   * Extract all relationships from parsed AST and entities
   */
  async extractRelationships(
    ast: ParsedAST,
    entities: CodeEntity[],
    filePath: string,
    options: RelationshipExtractionOptions = {}
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];

    try {
      // Build entity maps for quick lookup
      this.buildEntityMaps(entities, filePath);

      // Extract different types of relationships
      const callRelationships = await this.extractCallRelationships(ast, filePath, options);
      const importRelationships = await this.extractImportRelationships(ast, filePath, options);
      const inheritanceRelationships = await this.extractInheritanceRelationships(ast, filePath, options);
      const implementationRelationships = await this.extractImplementationRelationships(ast, filePath, options);
      const usageRelationships = await this.extractUsageRelationships(ast, filePath, options);
      const definitionRelationships = await this.extractDefinitionRelationships(ast, filePath, options);

      relationships.push(
        ...callRelationships,
        ...importRelationships,
        ...inheritanceRelationships,
        ...implementationRelationships,
        ...usageRelationships,
        ...definitionRelationships
      );

      return relationships;
    } catch (error) {
      console.error('Error extracting relationships:', error);
      return relationships; // Return partial results
    }
  }

  /**
   * Extract function call relationships
   */
  private async extractCallRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];
    
    // Find all function entities in this file
    const functionEntities = this.getEntitiesByFile(filePath).filter(e => e.type === 'Function');

    for (const functionEntity of functionEntities) {
      try {
        // Find the AST node for this function
        const functionNode = this.findNodeByPosition(ast.rootNode, functionEntity.line - 1, functionEntity.column - 1);
        if (!functionNode) continue;

        // Find all function calls within this function
        const callNodes = this.tsParser.findFunctionCalls(functionNode);

        for (const callNode of callNodes) {
          const calledFunctionName = this.tsParser.getCalledFunctionName(callNode);
          if (!calledFunctionName) continue;

          // Skip internal calls if not requested
          if (!options.includeInternalCalls && this.isInternalCall(calledFunctionName)) {
            continue;
          }

          // Find the target entity
          let targetEntity = this.findEntityByName(calledFunctionName, filePath);
          if (!targetEntity) {
            // Create placeholder for external function
            const externalEntity: CodeEntity = {
              id: uuidv4(),
              name: calledFunctionName,
              type: 'Function' as any,
              filePath: 'external',
              line: 0,
              column: 0,
              content: '',
              language: ast.language,
              metadata: {
                isExternal: true,
                calledFrom: filePath
              }
            };
            this.entityMap.set(externalEntity.id, externalEntity);
            targetEntity = externalEntity;
          }

          relationships.push({
            id: uuidv4(),
            sourceId: functionEntity.id,
            targetId: targetEntity.id,
            type: CodeRelationshipType.CALLS,
            filePath,
            line: callNode.startPosition.row + 1,
            metadata: {
              callType: this.getCallType(callNode),
              isAsync: this.isAsyncCall(callNode),
              parameters: this.extractCallParameters(callNode),
              nodeType: callNode.type
            }
          });
        }
      } catch (error) {
        console.error(`Error extracting calls for function ${functionEntity.name}:`, error);
      }
    }

    return relationships;
  }

  /**
   * Extract import relationships
   */
  private async extractImportRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];
    const importNodes = this.tsParser.findImports(ast.rootNode);

    for (const importNode of importNodes) {
      try {
        const importInfo = this.tsParser.getImportSpecifiers(importNode);
        const resolvedPath = await this.resolveImportPath(importInfo.source, filePath, options);

        // Create import entity if not exists
        const importEntity = this.findOrCreateImportEntity(importInfo, importNode, filePath, ast.language);

        // Create module entity for the imported module
        const moduleEntity = this.findOrCreateModuleEntity(importInfo.source, resolvedPath, ast.language);

        // Create IMPORTS relationship
        relationships.push({
          id: uuidv4(),
          sourceId: importEntity.id,
          targetId: moduleEntity.id,
          type: CodeRelationshipType.IMPORTS,
          filePath,
          line: importNode.startPosition.row + 1,
          metadata: {
            importType: this.getImportType(importInfo),
            specifiers: importInfo.specifiers,
            defaultImport: importInfo.defaultImport,
            namespaceImport: importInfo.namespaceImport,
            resolvedPath,
            isExternal: !resolvedPath.startsWith('.'),
            nodeType: importNode.type
          }
        });

        // Create USES relationships for each imported symbol
        for (const specifier of importInfo.specifiers) {
          const targetEntity = this.findEntityInModule(specifier, resolvedPath);
          if (targetEntity) {
            relationships.push({
              id: uuidv4(),
              sourceId: importEntity.id,
              targetId: targetEntity.id,
              type: CodeRelationshipType.USES,
              filePath,
              line: importNode.startPosition.row + 1,
              metadata: {
                importedAs: specifier,
                originalName: specifier,
                nodeType: importNode.type
              }
            });
          }
        }
      } catch (error) {
        console.error(`Error extracting import relationship:`, error);
      }
    }

    return relationships;
  }

  /**
   * Extract inheritance relationships
   */
  private async extractInheritanceRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];
    const classNodes = this.tsParser.findClasses(ast.rootNode);

    for (const classNode of classNodes) {
      try {
        const className = this.tsParser.getClassName(classNode);
        if (!className) continue;

        const classEntity = this.findEntityByName(className, filePath);
        if (!classEntity) continue;

        // Find extends clause
        const heritageClause = classNode.namedChildren.find(child => child.type === 'class_heritage');
        if (!heritageClause) continue;

        for (const clause of heritageClause.namedChildren) {
          if (clause.text.startsWith('extends')) {
            const extendsIdentifier = clause.namedChildren.find(child => 
              child.type === 'identifier' || child.type === 'type_identifier'
            );
            
            if (extendsIdentifier) {
              const parentClassName = extendsIdentifier.text;
              const parentEntity = this.findEntityByName(parentClassName, filePath) || 
                                 this.findExternalEntity(parentClassName);

              if (parentEntity) {
                relationships.push({
                  id: uuidv4(),
                  sourceId: classEntity.id,
                  targetId: parentEntity.id,
                  type: CodeRelationshipType.INHERITS,
                  filePath,
                  line: clause.startPosition.row + 1,
                  metadata: {
                    parentClass: parentClassName,
                    inheritanceType: 'extends',
                    nodeType: clause.type
                  }
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error extracting inheritance relationship:`, error);
      }
    }

    return relationships;
  }

  /**
   * Extract interface implementation relationships
   */
  private async extractImplementationRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];
    const classNodes = this.tsParser.findClasses(ast.rootNode);

    for (const classNode of classNodes) {
      try {
        const className = this.tsParser.getClassName(classNode);
        if (!className) continue;

        const classEntity = this.findEntityByName(className, filePath);
        if (!classEntity) continue;

        // Find implements clause
        const heritageClause = classNode.namedChildren.find(child => child.type === 'class_heritage');
        if (!heritageClause) continue;

        for (const clause of heritageClause.namedChildren) {
          if (clause.text.startsWith('implements')) {
            // Find all implemented interfaces
            for (const child of clause.namedChildren) {
              if (child.type === 'type_identifier' || child.type === 'identifier') {
                const interfaceName = child.text;
                const interfaceEntity = this.findEntityByName(interfaceName, filePath) || 
                                     this.findExternalEntity(interfaceName);

                if (interfaceEntity) {
                  relationships.push({
                    id: uuidv4(),
                    sourceId: classEntity.id,
                    targetId: interfaceEntity.id,
                    type: CodeRelationshipType.IMPLEMENTS,
                    filePath,
                    line: clause.startPosition.row + 1,
                    metadata: {
                      interfaceName,
                      nodeType: clause.type
                    }
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error extracting implementation relationship:`, error);
      }
    }

    return relationships;
  }

  /**
   * Extract variable/type usage relationships
   */
  private async extractUsageRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];

    // Find all variable references and type annotations
    const identifierNodes = this.tsParser.findNodesByType(ast.rootNode, 'identifier');
    const typeIdentifierNodes = this.tsParser.findNodesByType(ast.rootNode, 'type_identifier');

    const allNodes = [...identifierNodes, ...typeIdentifierNodes];

    for (const node of allNodes) {
      try {
        const referenceName = node.text;
        
        // Find the entity that contains this reference
        const containingEntity = this.findContainingEntity(node, filePath);
        if (!containingEntity) continue;

        // Find the referenced entity
        const referencedEntity = this.findEntityByName(referenceName, filePath);
        if (!referencedEntity || referencedEntity.id === containingEntity.id) continue;

        // Determine the relationship type
        const relationshipType = this.determineUsageType(node);

        relationships.push({
          id: uuidv4(),
          sourceId: containingEntity.id,
          targetId: referencedEntity.id,
          type: relationshipType,
          filePath,
          line: node.startPosition.row + 1,
          metadata: {
            referenceName,
            usageContext: this.getUsageContext(node),
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting usage relationship:`, error);
      }
    }

    return relationships;
  }

  /**
   * Extract definition relationships (class contains method, etc.)
   */
  private async extractDefinitionRelationships(
    ast: ParsedAST,
    filePath: string,
    options: RelationshipExtractionOptions
  ): Promise<CodeRelationship[]> {
    const relationships: CodeRelationship[] = [];
    
    // Find class-method relationships
    const classEntities = this.getEntitiesByFile(filePath).filter(e => e.type === 'Class');
    const functionEntities = this.getEntitiesByFile(filePath).filter(e => e.type === 'Function');

    for (const classEntity of classEntities) {
      for (const functionEntity of functionEntities) {
        // Check if function is within the class boundaries
        if (this.isEntityContainedIn(functionEntity, classEntity)) {
          relationships.push({
            id: uuidv4(),
            sourceId: classEntity.id,
            targetId: functionEntity.id,
            type: CodeRelationshipType.DEFINES,
            filePath,
            line: functionEntity.line,
            metadata: {
              memberType: 'method',
              visibility: functionEntity.metadata.visibility || 'public',
              isStatic: functionEntity.metadata.isStatic || false
            }
          });
        }
      }
    }

    // Find module-export relationships
    const moduleEntity = this.findOrCreateModuleEntity(filePath, filePath, ast.language);
    const exportEntities = this.getEntitiesByFile(filePath).filter(e => e.type === 'Export');

    for (const exportEntity of exportEntities) {
      relationships.push({
        id: uuidv4(),
        sourceId: moduleEntity.id,
        targetId: exportEntity.id,
        type: CodeRelationshipType.EXPORTS,
        filePath,
        line: exportEntity.line,
        metadata: {
          exportType: exportEntity.metadata.type || 'named',
          isDefault: exportEntity.metadata.isDefault || false
        }
      });
    }

    return relationships;
  }

  // Helper methods

  private buildEntityMaps(entities: CodeEntity[], filePath: string): void {
    // Clear existing maps for this file
    this.symbolTable.set(filePath, new Map());
    const fileSymbols = this.symbolTable.get(filePath)!;

    for (const entity of entities) {
      this.entityMap.set(entity.id, entity);
      if (entity.filePath === filePath) {
        fileSymbols.set(entity.name, entity);
      }
    }
  }

  private getEntitiesByFile(filePath: string): CodeEntity[] {
    return Array.from(this.entityMap.values()).filter(e => e.filePath === filePath);
  }

  private findEntityByName(name: string, filePath: string): CodeEntity | null {
    // First try current file
    const fileSymbols = this.symbolTable.get(filePath);
    if (fileSymbols?.has(name)) {
      return fileSymbols.get(name)!;
    }

    // Then try all files
    for (const entity of this.entityMap.values()) {
      if (entity.name === name) {
        return entity;
      }
    }

    return null;
  }

  private findExternalEntity(name: string): CodeEntity | null {
    // Create placeholder for external entities
    const externalEntity: CodeEntity = {
      id: uuidv4(),
      name,
      type: 'Function' as any, // Default to function, could be improved
      filePath: 'external',
      line: 0,
      column: 0,
      content: '',
      language: 'unknown',
      metadata: {
        isExternal: true
      }
    };
    
    this.entityMap.set(externalEntity.id, externalEntity);
    return externalEntity;
  }

  private findNodeByPosition(rootNode: Parser.SyntaxNode, line: number, column: number): Parser.SyntaxNode | null {
    // Simple implementation - could be optimized
    const target = { row: line, column };
    
    function findNode(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
      if (node.startPosition.row === target.row && 
          node.startPosition.column <= target.column && 
          node.endPosition.column >= target.column) {
        
        // Check children for more specific match
        for (const child of node.namedChildren) {
          const childResult = findNode(child);
          if (childResult) return childResult;
        }
        
        return node;
      }
      return null;
    }

    return findNode(rootNode);
  }

  private isInternalCall(functionName: string): boolean {
    // Check if it's a built-in or common library function
    const internalFunctions = new Set([
      'console', 'setTimeout', 'setInterval', 'Promise', 'Array', 'Object', 'JSON'
    ]);
    
    return internalFunctions.has(functionName) || functionName.startsWith('_');
  }

  private getCallType(callNode: Parser.SyntaxNode): string {
    const functionNode = callNode.namedChildren[0];
    
    if (functionNode?.type === 'member_expression') {
      return 'method_call';
    } else if (functionNode?.type === 'identifier') {
      return 'function_call';
    } else {
      return 'unknown_call';
    }
  }

  private isAsyncCall(callNode: Parser.SyntaxNode): boolean {
    // Check if call is in await expression
    let parent = callNode.parent;
    while (parent) {
      if (parent.type === 'await_expression') {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  private extractCallParameters(callNode: Parser.SyntaxNode): string[] {
    const parameters: string[] = [];
    const argumentsNode = callNode.namedChildren.find(child => child.type === 'arguments');
    
    if (argumentsNode) {
      for (const arg of argumentsNode.namedChildren) {
        parameters.push(arg.text);
      }
    }
    
    return parameters;
  }

  private async resolveImportPath(
    importPath: string, 
    currentFilePath: string, 
    options: RelationshipExtractionOptions
  ): Promise<string> {
    if (!options.resolveExternalImports && !importPath.startsWith('.')) {
      return importPath; // External import, return as-is
    }

    // Simple path resolution - in production, would use proper module resolution
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      // Relative import
      const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
      return this.resolvePath(currentDir, importPath);
    }

    return importPath;
  }

  private resolvePath(basePath: string, relativePath: string): string {
    // Simple path resolution implementation
    const parts = basePath.split('/').concat(relativePath.split('/'));
    const resolved: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }
    
    return resolved.join('/');
  }

  private findOrCreateImportEntity(
    importInfo: any, 
    importNode: Parser.SyntaxNode, 
    filePath: string, 
    language: string
  ): CodeEntity {
    const entityId = `import_${filePath}_${importNode.startPosition.row}`;
    
    if (this.entityMap.has(entityId)) {
      return this.entityMap.get(entityId)!;
    }

    const entity: CodeEntity = {
      id: entityId,
      name: `import from ${importInfo.source}`,
      type: 'Import' as any,
      filePath,
      line: importNode.startPosition.row + 1,
      column: importNode.startPosition.column + 1,
      content: importNode.text,
      language,
      metadata: {
        source: importInfo.source,
        specifiers: importInfo.specifiers,
        defaultImport: importInfo.defaultImport,
        namespaceImport: importInfo.namespaceImport
      }
    };

    this.entityMap.set(entityId, entity);
    return entity;
  }

  private findOrCreateModuleEntity(source: string, resolvedPath: string, language: string): CodeEntity {
    const entityId = `module_${resolvedPath}`;
    
    if (this.entityMap.has(entityId)) {
      return this.entityMap.get(entityId)!;
    }

    const entity: CodeEntity = {
      id: entityId,
      name: source,
      type: 'Module' as any,
      filePath: resolvedPath,
      line: 1,
      column: 1,
      content: '',
      language,
      metadata: {
        source,
        resolvedPath,
        isExternal: !resolvedPath.startsWith('.')
      }
    };

    this.entityMap.set(entityId, entity);
    return entity;
  }

  private findEntityInModule(symbolName: string, modulePath: string): CodeEntity | null {
    // Look for exported entities in the target module
    for (const entity of this.entityMap.values()) {
      if (entity.filePath === modulePath && entity.name === symbolName) {
        return entity;
      }
    }
    return null;
  }

  private getImportType(importInfo: any): string {
    if (importInfo.defaultImport) return 'default';
    if (importInfo.namespaceImport) return 'namespace';
    if (importInfo.specifiers.length > 0) return 'named';
    return 'side_effect';
  }

  private findContainingEntity(node: Parser.SyntaxNode, filePath: string): CodeEntity | null {
    // Find the entity that contains this node
    const entities = this.getEntitiesByFile(filePath);
    
    for (const entity of entities) {
      if (node.startPosition.row + 1 >= entity.line && 
          node.startPosition.row + 1 <= (entity.metadata.endLine || entity.line)) {
        return entity;
      }
    }
    
    return null;
  }

  private determineUsageType(node: Parser.SyntaxNode): CodeRelationshipType {
    // Determine the type of usage based on context
    let parent = node.parent;
    
    while (parent) {
      switch (parent.type) {
        case 'call_expression':
          return CodeRelationshipType.CALLS;
        case 'type_annotation':
        case 'type_identifier':
          return CodeRelationshipType.USES;
        case 'assignment_expression':
          return CodeRelationshipType.MODIFIES;
        default:
          parent = parent.parent;
      }
    }
    
    return CodeRelationshipType.REFERENCES;
  }

  private getUsageContext(node: Parser.SyntaxNode): string {
    const parent = node.parent;
    return parent ? parent.type : 'unknown';
  }

  private isEntityContainedIn(inner: CodeEntity, outer: CodeEntity): boolean {
    return inner.line >= outer.line && 
           inner.line <= (outer.metadata.endLine || outer.line) &&
           inner.filePath === outer.filePath;
  }
}