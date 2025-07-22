/**
 * TypeScript/JavaScript Parser
 * Uses tree-sitter to parse TypeScript and JavaScript code
 */

import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import JavaScript from "tree-sitter-javascript";
import { Result } from "../../types/index.js";
import { toKBError } from "../../types/error-utils.js";

export interface ParsedAST {
  tree: Parser.Tree;
  language: string;
  filePath: string;
  content: string;
  rootNode: Parser.SyntaxNode;
}

export interface ParsedNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: ParsedNode[];
  parent?: ParsedNode;
  namedChildren: ParsedNode[];
  fieldName?: string;
}

export class TypeScriptParser {
  private tsParser: Parser;
  private jsParser: Parser;
  private initialized = false;

  constructor() {
    this.tsParser = new Parser();
    this.jsParser = new Parser();
  }

  /**
   * Initialize parsers with language grammars
   */
  async initialize(): Promise<Result<void>> {
    try {
      if (this.initialized) {
        return { success: true, data: undefined };
      }

      // Set TypeScript language
      this.tsParser.setLanguage(TypeScript.typescript);

      // Set JavaScript language
      this.jsParser.setLanguage(JavaScript);

      this.initialized = true;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: "initialize" }),
      };
    }
  }

  /**
   * Parse TypeScript/JavaScript code
   */
  async parse(content: string, filePath: string): Promise<Result<ParsedAST>> {
    try {
      await this.initialize();

      const isTypeScript = this.isTypeScriptFile(filePath);
      const parser = isTypeScript ? this.tsParser : this.jsParser;
      const language = isTypeScript ? "typescript" : "javascript";

      const tree = parser.parse(content);

      if (!tree.rootNode) {
        return {
          success: false,
          error: toKBError(new Error("Failed to parse code - no root node"), {
            operation: "parse",
          }),
        };
      }

      // Check for syntax errors
      if (tree.rootNode.hasError()) {
        const errors = this.findSyntaxErrors(tree.rootNode);
        console.warn(`Syntax errors found in ${filePath}:`, errors);
        // Continue parsing despite errors for partial analysis
      }

      return {
        success: true,
        data: {
          tree,
          language,
          filePath,
          content,
          rootNode: tree.rootNode,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toKBError(error, { operation: "parse" }),
      };
    }
  }

  /**
   * Find all nodes of a specific type
   */
  findNodesByType(
    node: Parser.SyntaxNode,
    nodeType: string,
  ): Parser.SyntaxNode[] {
    const results: Parser.SyntaxNode[] = [];

    if (node.type === nodeType) {
      results.push(node);
    }

    for (const child of node.namedChildren) {
      results.push(...this.findNodesByType(child, nodeType));
    }

    return results;
  }

  /**
   * Find function declarations
   */
  findFunctions(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const functionTypes = [
      "function_declaration",
      "method_definition",
      "arrow_function",
      "function_expression",
      "generator_function_declaration",
    ];

    const functions: Parser.SyntaxNode[] = [];
    for (const type of functionTypes) {
      functions.push(...this.findNodesByType(rootNode, type));
    }

    return functions;
  }

  /**
   * Find class declarations
   */
  findClasses(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this.findNodesByType(rootNode, "class_declaration");
  }

  /**
   * Find interface declarations
   */
  findInterfaces(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this.findNodesByType(rootNode, "interface_declaration");
  }

  /**
   * Find type declarations
   */
  findTypes(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this.findNodesByType(rootNode, "type_alias_declaration");
  }

  /**
   * Find variable declarations
   */
  findVariables(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const variableTypes = ["variable_declaration", "lexical_declaration"];

    const variables: Parser.SyntaxNode[] = [];
    for (const type of variableTypes) {
      variables.push(...this.findNodesByType(rootNode, type));
    }

    return variables;
  }

  /**
   * Find import statements
   */
  findImports(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this.findNodesByType(rootNode, "import_statement");
  }

  /**
   * Find export statements
   */
  findExports(rootNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
    const exportTypes = ["export_statement", "export_declaration"];

    const exports: Parser.SyntaxNode[] = [];
    for (const type of exportTypes) {
      exports.push(...this.findNodesByType(rootNode, type));
    }

    return exports;
  }

  /**
   * Get function name from function node
   */
  getFunctionName(node: Parser.SyntaxNode): string | null {
    // Try to find identifier in various positions
    const identifierNode = node.namedChildren.find(
      (child) =>
        child.type === "identifier" ||
        (child.type === "property_identifier" &&
          child.parent?.type === "method_definition"),
    );

    if (identifierNode) {
      return identifierNode.text;
    }

    // For arrow functions assigned to variables
    if (node.parent?.type === "variable_declarator") {
      const nameNode = node.parent.namedChildren[0];
      if (nameNode?.type === "identifier") {
        return nameNode.text;
      }
    }

    return null;
  }

  /**
   * Get function signature
   */
  getFunctionSignature(node: Parser.SyntaxNode, content: string): string {
    const start = node.startIndex;
    const end = node.endIndex;

    // Find the opening brace to get just the signature
    let signatureEnd = end;
    for (let i = start; i < end; i++) {
      if (content[i] === "{" || content[i] === "=>") {
        signatureEnd = i;
        break;
      }
    }

    return content.substring(start, signatureEnd).trim();
  }

  /**
   * Get class name from class node
   */
  getClassName(node: Parser.SyntaxNode): string | null {
    const identifierNode = node.namedChildren.find(
      (child) => child.type === "identifier",
    );
    return identifierNode ? identifierNode.text : null;
  }

  /**
   * Get interface name from interface node
   */
  getInterfaceName(node: Parser.SyntaxNode): string | null {
    const identifierNode = node.namedChildren.find(
      (child) => child.type === "type_identifier",
    );
    return identifierNode ? identifierNode.text : null;
  }

  /**
   * Get variable names from variable declaration
   */
  getVariableNames(node: Parser.SyntaxNode): string[] {
    const names: string[] = [];

    // Handle different variable declaration patterns
    const declarators = this.findNodesByType(node, "variable_declarator");

    for (const declarator of declarators) {
      const identifier = declarator.namedChildren[0];
      if (identifier?.type === "identifier") {
        names.push(identifier.text);
      }
      // Handle destructuring
      else if (
        identifier?.type === "object_pattern" ||
        identifier?.type === "array_pattern"
      ) {
        names.push(...this.extractDestructuredNames(identifier));
      }
    }

    return names;
  }

  /**
   * Extract names from destructuring patterns
   */
  private extractDestructuredNames(node: Parser.SyntaxNode): string[] {
    const names: string[] = [];

    for (const child of node.namedChildren) {
      if (child.type === "identifier") {
        names.push(child.text);
      } else if (child.type === "shorthand_property_identifier_pattern") {
        names.push(child.text);
      } else if (
        child.type === "object_pattern" ||
        child.type === "array_pattern"
      ) {
        names.push(...this.extractDestructuredNames(child));
      }
    }

    return names;
  }

  /**
   * Get import specifiers
   */
  getImportSpecifiers(node: Parser.SyntaxNode): {
    source: string;
    specifiers: string[];
    defaultImport?: string;
    namespaceImport?: string;
  } {
    const source = this.getImportSource(node);
    const specifiers: string[] = [];
    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;

    // Find import clause
    const importClause = node.namedChildren.find(
      (child) => child.type === "import_clause",
    );

    if (importClause) {
      for (const child of importClause.namedChildren) {
        switch (child.type) {
          case "identifier":
            defaultImport = child.text;
            break;
          case "namespace_import": {
            const nsIdentifier = child.namedChildren.find(
              (c) => c.type === "identifier",
            );
            if (nsIdentifier) {
              namespaceImport = nsIdentifier.text;
            }
            break;
          }
          case "named_imports":
            for (const spec of child.namedChildren) {
              if (spec.type === "import_specifier") {
                const identifier = spec.namedChildren.find(
                  (c) => c.type === "identifier",
                );
                if (identifier) {
                  specifiers.push(identifier.text);
                }
              }
            }
            break;
        }
      }
    }

    return {
      source,
      specifiers,
      defaultImport,
      namespaceImport,
    };
  }

  /**
   * Get import source path
   */
  private getImportSource(node: Parser.SyntaxNode): string {
    const stringNode = node.namedChildren.find(
      (child) => child.type === "string",
    );
    if (stringNode) {
      // Remove quotes
      return stringNode.text.slice(1, -1);
    }
    return "";
  }

  /**
   * Calculate cyclomatic complexity for a function
   */
  calculateComplexity(node: Parser.SyntaxNode): number {
    let complexity = 1; // Base complexity

    const complexityNodes = [
      "if_statement",
      "while_statement",
      "for_statement",
      "for_in_statement",
      "for_of_statement",
      "do_statement",
      "switch_statement",
      "case_clause",
      "catch_clause",
      "conditional_expression",
      "logical_expression",
    ];

    for (const nodeType of complexityNodes) {
      complexity += this.findNodesByType(node, nodeType).length;
    }

    return complexity;
  }

  /**
   * Get line count for a node
   */
  getLineCount(node: Parser.SyntaxNode): number {
    return node.endPosition.row - node.startPosition.row + 1;
  }

  /**
   * Find function calls within a node
   */
  findFunctionCalls(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this.findNodesByType(node, "call_expression");
  }

  /**
   * Get called function name from call expression
   */
  getCalledFunctionName(callNode: Parser.SyntaxNode): string | null {
    const functionNode = callNode.namedChildren[0];

    if (functionNode?.type === "identifier") {
      return functionNode.text;
    }

    if (functionNode?.type === "member_expression") {
      const property = functionNode.namedChildren[1];
      if (property?.type === "property_identifier") {
        return property.text;
      }
    }

    return null;
  }

  /**
   * Convert tree-sitter node to our ParsedNode format
   */
  nodeToObject(node: Parser.SyntaxNode): ParsedNode {
    return {
      type: node.type,
      text: node.text,
      startPosition: {
        row: node.startPosition.row,
        column: node.startPosition.column,
      },
      endPosition: {
        row: node.endPosition.row,
        column: node.endPosition.column,
      },
      children: node.children.map((child) => this.nodeToObject(child)),
      namedChildren: node.namedChildren.map((child) =>
        this.nodeToObject(child),
      ),
      fieldName: node.parent
        ? node.parent.fieldNameForChild(node.id) || undefined
        : undefined,
    };
  }

  /**
   * Check if file is TypeScript
   */
  private isTypeScriptFile(filePath: string): boolean {
    return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
  }

  /**
   * Find syntax errors in the AST
   */
  private findSyntaxErrors(
    node: Parser.SyntaxNode,
  ): Array<{ line: number; column: number; message: string }> {
    const errors: Array<{ line: number; column: number; message: string }> = [];

    if (node.type === "ERROR") {
      errors.push({
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        message: `Syntax error: ${node.text}`,
      });
    }

    if (node.isMissing()) {
      errors.push({
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        message: `Missing node: ${node.type}`,
      });
    }

    for (const child of node.children) {
      errors.push(...this.findSyntaxErrors(child));
    }

    return errors;
  }

  /**
   * Get documentation comment for a node
   */
  getDocumentation(node: Parser.SyntaxNode, content: string): string | null {
    // Look for JSDoc comment before the node
    const lines = content.split("\n");
    const nodeStartLine = node.startPosition.row;

    const docLines: string[] = [];
    let currentLine = nodeStartLine - 1;

    // Scan backwards for documentation
    while (currentLine >= 0) {
      const line = lines[currentLine].trim();

      if (line.endsWith("*/")) {
        // Found end of JSDoc comment
        docLines.unshift(line);
        currentLine--;

        // Continue until we find the start
        while (currentLine >= 0) {
          const docLine = lines[currentLine].trim();
          docLines.unshift(docLine);
          if (docLine.startsWith("/**")) {
            break;
          }
          currentLine--;
        }
        break;
      } else if (line === "" || line.startsWith("//")) {
        // Skip empty lines and single-line comments
        currentLine--;
        continue;
      } else {
        // Found non-comment content, stop looking
        break;
      }
    }

    if (docLines.length > 0 && docLines[0].startsWith("/**")) {
      return docLines.join("\n");
    }

    return null;
  }
}
