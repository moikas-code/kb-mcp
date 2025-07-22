/**
 * Entity Extractor
 * Extracts code entities (functions, classes, variables, etc.) from parsed AST
 */

import Parser from 'tree-sitter';
import { v4 as uuidv4 } from 'uuid';
import { CodeEntity, CodeEntityType } from '../code-analyzer.js';
import { TypeScriptParser, ParsedAST } from '../parsers/typescript-parser.js';
import { Result } from '../../types/index.js';
import { toKBError } from '../../types/error-utils.js';

export interface ExtractionOptions {
  includePrivate?: boolean;
  includeTests?: boolean;
  minComplexity?: number;
  maxDepth?: number;
}

export class EntityExtractor {
  private tsParser: TypeScriptParser;

  constructor() {
    this.tsParser = new TypeScriptParser();
  }

  /**
   * Extract all entities from parsed AST
   */
  async extractEntities(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions = {}
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];

    try {
      // Extract different types of entities
      const functions = await this.extractFunctions(ast, filePath, language, options);
      const classes = await this.extractClasses(ast, filePath, language, options);
      const interfaces = await this.extractInterfaces(ast, filePath, language, options);
      const types = await this.extractTypes(ast, filePath, language, options);
      const variables = await this.extractVariables(ast, filePath, language, options);
      const imports = await this.extractImports(ast, filePath, language, options);
      const exports = await this.extractExports(ast, filePath, language, options);

      entities.push(...functions, ...classes, ...interfaces, ...types, ...variables, ...imports, ...exports);

      return entities;
    } catch (error) {
      console.error('Error extracting entities:', error);
      return entities; // Return partial results
    }
  }

  /**
   * Extract function entities
   */
  private async extractFunctions(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    const functionNodes = this.tsParser.findFunctions(ast.rootNode);

    for (const node of functionNodes) {
      try {
        const name = this.tsParser.getFunctionName(node);
        if (!name) continue;

        // Skip private functions if not requested
        if (!options.includePrivate && this.isPrivate(node, ast.content)) {
          continue;
        }

        // Skip test functions if not requested
        if (!options.includeTests && this.isTestFunction(name)) {
          continue;
        }

        const signature = this.tsParser.getFunctionSignature(node, ast.content);
        const complexity = this.tsParser.calculateComplexity(node);
        const lineCount = this.tsParser.getLineCount(node);
        const documentation = this.tsParser.getDocumentation(node, ast.content);

        // Skip low complexity functions if threshold set
        if (options.minComplexity && complexity < options.minComplexity) {
          continue;
        }

        const parameters = this.extractFunctionParameters(node);
        const returnType = this.extractReturnType(node);
        const visibility = this.extractVisibility(node, ast.content);
        const isAsync = this.isAsyncFunction(node);
        const isStatic = this.isStaticFunction(node);

        entities.push({
          id: uuidv4(),
          name,
          type: CodeEntityType.FUNCTION,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          signature,
          language,
          metadata: {
            parameters,
            returnType,
            visibility,
            isAsync,
            isStatic,
            complexity,
            lineCount,
            documentation,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting function entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract class entities
   */
  private async extractClasses(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    const classNodes = this.tsParser.findClasses(ast.rootNode);

    for (const node of classNodes) {
      try {
        const name = this.tsParser.getClassName(node);
        if (!name) continue;

        const documentation = this.tsParser.getDocumentation(node, ast.content);
        const visibility = this.extractVisibility(node, ast.content);
        const isAbstract = this.isAbstractClass(node);
        const extendsClass = this.extractExtendsClass(node);
        const implementsInterfaces = this.extractImplementsInterfaces(node);
        
        const methods = this.extractClassMethods(node);
        const properties = this.extractClassProperties(node);
        const constructors = this.extractConstructors(node);

        entities.push({
          id: uuidv4(),
          name,
          type: CodeEntityType.CLASS,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          language,
          metadata: {
            visibility,
            isAbstract,
            extends: extendsClass,
            implements: implementsInterfaces,
            methods,
            properties,
            constructors,
            documentation,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting class entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract interface entities
   */
  private async extractInterfaces(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    
    if (language !== 'typescript') return entities; // Interfaces are TypeScript specific

    const interfaceNodes = this.tsParser.findInterfaces(ast.rootNode);

    for (const node of interfaceNodes) {
      try {
        const name = this.tsParser.getInterfaceName(node);
        if (!name) continue;

        const documentation = this.tsParser.getDocumentation(node, ast.content);
        const extendsInterfaces = this.extractExtendsInterfaces(node);
        const methods = this.extractInterfaceMethods(node);
        const properties = this.extractInterfaceProperties(node);

        entities.push({
          id: uuidv4(),
          name,
          type: CodeEntityType.INTERFACE,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          language,
          metadata: {
            extends: extendsInterfaces,
            methods,
            properties,
            documentation,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting interface entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract type entities
   */
  private async extractTypes(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    
    if (language !== 'typescript') return entities; // Type aliases are TypeScript specific

    const typeNodes = this.tsParser.findTypes(ast.rootNode);

    for (const node of typeNodes) {
      try {
        const nameNode = node.namedChildren.find(child => child.type === 'type_identifier');
        if (!nameNode) continue;

        const name = nameNode.text;
        const documentation = this.tsParser.getDocumentation(node, ast.content);
        const definition = this.extractTypeDefinition(node);
        const genericParameters = this.extractGenericParameters(node);

        entities.push({
          id: uuidv4(),
          name,
          type: CodeEntityType.TYPE,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          language,
          metadata: {
            definition,
            genericParameters,
            documentation,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting type entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract variable entities
   */
  private async extractVariables(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    const variableNodes = this.tsParser.findVariables(ast.rootNode);

    for (const node of variableNodes) {
      try {
        const names = this.tsParser.getVariableNames(node);

        for (const name of names) {
          const variableType = this.extractVariableType(node, name);
          const scope = this.extractVariableScope(node);
          const isConstant = this.isConstantVariable(node);
          const isStatic = this.isStaticVariable(node);
          const initialValue = this.extractInitialValue(node, name);

          entities.push({
            id: uuidv4(),
            name,
            type: isConstant ? CodeEntityType.CONSTANT : CodeEntityType.VARIABLE,
            filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column + 1,
            content: node.text,
            language,
            metadata: {
              variableType,
              scope,
              isConstant,
              isStatic,
              initialValue,
              endLine: node.endPosition.row + 1,
              nodeType: node.type
            }
          });
        }
      } catch (error) {
        console.error(`Error extracting variable entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract import entities
   */
  private async extractImports(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    const importNodes = this.tsParser.findImports(ast.rootNode);

    for (const node of importNodes) {
      try {
        const importInfo = this.tsParser.getImportSpecifiers(node);
        
        entities.push({
          id: uuidv4(),
          name: `import from ${importInfo.source}`,
          type: CodeEntityType.IMPORT,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          language,
          metadata: {
            source: importInfo.source,
            specifiers: importInfo.specifiers,
            defaultImport: importInfo.defaultImport,
            namespaceImport: importInfo.namespaceImport,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting import entity:`, error);
      }
    }

    return entities;
  }

  /**
   * Extract export entities
   */
  private async extractExports(
    ast: ParsedAST, 
    filePath: string, 
    language: string,
    options: ExtractionOptions
  ): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    const exportNodes = this.tsParser.findExports(ast.rootNode);

    for (const node of exportNodes) {
      try {
        const exportInfo = this.extractExportInfo(node);
        
        entities.push({
          id: uuidv4(),
          name: `export ${exportInfo.name || 'unnamed'}`,
          type: CodeEntityType.EXPORT,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column + 1,
          content: node.text,
          language,
          metadata: {
            ...exportInfo,
            endLine: node.endPosition.row + 1,
            nodeType: node.type
          }
        });
      } catch (error) {
        console.error(`Error extracting export entity:`, error);
      }
    }

    return entities;
  }

  // Helper methods

  private isPrivate(node: Parser.SyntaxNode, content: string): boolean {
    // Check for private keyword in TypeScript
    const text = node.text;
    return text.includes('private ') || node.text.startsWith('_');
  }

  private isTestFunction(name: string): boolean {
    const testPatterns = [
      /^test/i,
      /^it/i,
      /^describe/i,
      /^beforeEach/i,
      /^afterEach/i,
      /^beforeAll/i,
      /^afterAll/i,
      /\.test\./,
      /\.spec\./
    ];

    return testPatterns.some(pattern => pattern.test(name));
  }

  private extractFunctionParameters(node: Parser.SyntaxNode): string[] {
    const parameters: string[] = [];
    const parameterNode = node.namedChildren.find(child => 
      child.type === 'formal_parameters' || child.type === 'parameters'
    );

    if (parameterNode) {
      for (const param of parameterNode.namedChildren) {
        if (param.type === 'identifier' || param.type === 'required_parameter') {
          parameters.push(param.text);
        }
      }
    }

    return parameters;
  }

  private extractReturnType(node: Parser.SyntaxNode): string | null {
    const typeAnnotation = node.namedChildren.find(child => child.type === 'type_annotation');
    return typeAnnotation ? typeAnnotation.text : null;
  }

  private extractVisibility(node: Parser.SyntaxNode, content: string): 'public' | 'private' | 'protected' | 'internal' {
    const text = node.text;
    if (text.includes('private ')) return 'private';
    if (text.includes('protected ')) return 'protected';
    if (text.includes('internal ')) return 'internal';
    return 'public';
  }

  private isAsyncFunction(node: Parser.SyntaxNode): boolean {
    return node.text.includes('async ') || node.type === 'async_function';
  }

  private isStaticFunction(node: Parser.SyntaxNode): boolean {
    return node.text.includes('static ');
  }

  private isAbstractClass(node: Parser.SyntaxNode): boolean {
    return node.text.includes('abstract ');
  }

  private extractExtendsClass(node: Parser.SyntaxNode): string | null {
    const heritageClause = node.namedChildren.find(child => child.type === 'class_heritage');
    if (heritageClause) {
      const extendsClause = heritageClause.namedChildren.find(child => 
        child.text.startsWith('extends')
      );
      if (extendsClause) {
        const identifier = extendsClause.namedChildren.find(child => child.type === 'identifier');
        return identifier ? identifier.text : null;
      }
    }
    return null;
  }

  private extractImplementsInterfaces(node: Parser.SyntaxNode): string[] {
    const interfaces: string[] = [];
    const heritageClause = node.namedChildren.find(child => child.type === 'class_heritage');
    
    if (heritageClause) {
      const implementsClause = heritageClause.namedChildren.find(child => 
        child.text.startsWith('implements')
      );
      
      if (implementsClause) {
        for (const child of implementsClause.namedChildren) {
          if (child.type === 'type_identifier' || child.type === 'identifier') {
            interfaces.push(child.text);
          }
        }
      }
    }
    
    return interfaces;
  }

  private extractClassMethods(node: Parser.SyntaxNode): string[] {
    const methods: string[] = [];
    const body = node.namedChildren.find(child => child.type === 'class_body');
    
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'method_definition') {
          const nameNode = member.namedChildren.find(child => 
            child.type === 'property_identifier' || child.type === 'identifier'
          );
          if (nameNode) {
            methods.push(nameNode.text);
          }
        }
      }
    }
    
    return methods;
  }

  private extractClassProperties(node: Parser.SyntaxNode): string[] {
    const properties: string[] = [];
    const body = node.namedChildren.find(child => child.type === 'class_body');
    
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'property_definition' || member.type === 'field_definition') {
          const nameNode = member.namedChildren.find(child => 
            child.type === 'property_identifier' || child.type === 'identifier'
          );
          if (nameNode) {
            properties.push(nameNode.text);
          }
        }
      }
    }
    
    return properties;
  }

  private extractConstructors(node: Parser.SyntaxNode): string[] {
    const constructors: string[] = [];
    const body = node.namedChildren.find(child => child.type === 'class_body');
    
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'method_definition') {
          const nameNode = member.namedChildren.find(child => 
            child.type === 'property_identifier' || child.type === 'identifier'
          );
          if (nameNode && nameNode.text === 'constructor') {
            constructors.push(member.text);
          }
        }
      }
    }
    
    return constructors;
  }

  private extractExtendsInterfaces(node: Parser.SyntaxNode): string[] {
    const interfaces: string[] = [];
    const heritageClause = node.namedChildren.find(child => child.type === 'extends_clause');
    
    if (heritageClause) {
      for (const child of heritageClause.namedChildren) {
        if (child.type === 'type_identifier' || child.type === 'identifier') {
          interfaces.push(child.text);
        }
      }
    }
    
    return interfaces;
  }

  private extractInterfaceMethods(node: Parser.SyntaxNode): string[] {
    const methods: string[] = [];
    const body = node.namedChildren.find(child => child.type === 'object_type');
    
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'method_signature') {
          const nameNode = member.namedChildren.find(child => 
            child.type === 'property_identifier' || child.type === 'identifier'
          );
          if (nameNode) {
            methods.push(nameNode.text);
          }
        }
      }
    }
    
    return methods;
  }

  private extractInterfaceProperties(node: Parser.SyntaxNode): string[] {
    const properties: string[] = [];
    const body = node.namedChildren.find(child => child.type === 'object_type');
    
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'property_signature') {
          const nameNode = member.namedChildren.find(child => 
            child.type === 'property_identifier' || child.type === 'identifier'
          );
          if (nameNode) {
            properties.push(nameNode.text);
          }
        }
      }
    }
    
    return properties;
  }

  private extractTypeDefinition(node: Parser.SyntaxNode): string {
    const typeNode = node.namedChildren.find(child => 
      child.type !== 'type_identifier' && child.type !== 'type_parameters'
    );
    return typeNode ? typeNode.text : '';
  }

  private extractGenericParameters(node: Parser.SyntaxNode): string[] {
    const parameters: string[] = [];
    const typeParams = node.namedChildren.find(child => child.type === 'type_parameters');
    
    if (typeParams) {
      for (const param of typeParams.namedChildren) {
        if (param.type === 'type_parameter') {
          const nameNode = param.namedChildren.find(child => child.type === 'type_identifier');
          if (nameNode) {
            parameters.push(nameNode.text);
          }
        }
      }
    }
    
    return parameters;
  }

  private extractVariableType(node: Parser.SyntaxNode, name: string): string | null {
    // Find the specific variable declarator for this name
    const declarators = this.tsParser.findNodesByType(node, 'variable_declarator');
    
    for (const declarator of declarators) {
      const identifier = declarator.namedChildren[0];
      if (identifier?.text === name) {
        const typeAnnotation = declarator.namedChildren.find(child => child.type === 'type_annotation');
        return typeAnnotation ? typeAnnotation.text : null;
      }
    }
    
    return null;
  }

  private extractVariableScope(node: Parser.SyntaxNode): 'global' | 'function' | 'block' | 'module' {
    // Determine scope based on parent nodes
    let current = node.parent;
    while (current) {
      switch (current.type) {
        case 'function_declaration':
        case 'method_definition':
        case 'arrow_function':
          return 'function';
        case 'block':
          return 'block';
        case 'program':
          return 'global';
        case 'module':
          return 'module';
      }
      current = current.parent;
    }
    return 'global';
  }

  private isConstantVariable(node: Parser.SyntaxNode): boolean {
    return node.text.includes('const ');
  }

  private isStaticVariable(node: Parser.SyntaxNode): boolean {
    return node.text.includes('static ');
  }

  private extractInitialValue(node: Parser.SyntaxNode, name: string): string | null {
    const declarators = this.tsParser.findNodesByType(node, 'variable_declarator');
    
    for (const declarator of declarators) {
      const identifier = declarator.namedChildren[0];
      if (identifier?.text === name && declarator.namedChildren.length > 1) {
        const initializer = declarator.namedChildren[declarator.namedChildren.length - 1];
        return initializer ? initializer.text : null;
      }
    }
    
    return null;
  }

  private extractExportInfo(node: Parser.SyntaxNode): any {
    // Extract export information based on export type
    if (node.text.includes('export default')) {
      return {
        name: 'default',
        isDefault: true,
        type: 'default_export'
      };
    }
    
    // Handle named exports
    const nameNode = node.namedChildren.find(child => 
      child.type === 'identifier' || child.type === 'export_clause'
    );
    
    return {
      name: nameNode ? nameNode.text : null,
      isDefault: false,
      type: 'named_export'
    };
  }
}