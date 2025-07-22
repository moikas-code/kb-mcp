/**
 * Parser Management
 * Centralized management of language-specific parsers
 */

import { TypeScriptParser } from './typescript-parser.js';
import { Result } from '../../types/index.js';

export interface LanguageParser {
  parse(content: string, filePath: string): Promise<Result<any>>;
  initialize(): Promise<Result<void>>;
}

export class ParserManager {
  private parsers: Map<string, LanguageParser> = new Map();
  private initialized = false;

  constructor() {
    // Register available parsers
    this.parsers.set('typescript', new TypeScriptParser());
    this.parsers.set('javascript', new TypeScriptParser()); // TS parser handles JS too
  }

  /**
   * Initialize all parsers
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return { success: true, data: undefined };
    }

    try {
      // Initialize all registered parsers
      for (const [language, parser] of this.parsers) {
        const result = await parser.initialize();
        if (!result.success) {
          console.warn(`Failed to initialize ${language} parser:`, result.error);
        }
      }

      this.initialized = true;
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: {
          name: 'ParserInitializationError',
          message: `Failed to initialize parsers: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'PARSER_INIT_FAILED',
          statusCode: 500,
          isOperational: true
        }
      };
    }
  }

  /**
   * Get parser for a specific language
   */
  getParser(language: string): LanguageParser | null {
    return this.parsers.get(language) || null;
  }

  /**
   * Detect language from file path
   */
  detectLanguage(filePath: string): string {
    const ext = filePath.toLowerCase().split('.').pop();
    
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      case 'c':
        return 'c';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'php':
        return 'php';
      case 'rb':
        return 'ruby';
      case 'swift':
        return 'swift';
      case 'kt':
        return 'kotlin';
      case 'cs':
        return 'csharp';
      case 'dart':
        return 'dart';
      default:
        return 'unknown';
    }
  }

  /**
   * Check if language is supported
   */
  isLanguageSupported(language: string): boolean {
    return this.parsers.has(language);
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Parse file with appropriate parser
   */
  async parseFile(filePath: string, content: string): Promise<Result<any>> {
    await this.initialize();

    const language = this.detectLanguage(filePath);
    const parser = this.getParser(language);

    if (!parser) {
      return {
        success: false,
        error: {
          name: 'UnsupportedLanguageError',
          message: `Unsupported language: ${language} for file: ${filePath}`,
          code: 'LANGUAGE_NOT_SUPPORTED',
          statusCode: 400,
          isOperational: true
        }
      };
    }

    return parser.parse(content, filePath);
  }

  /**
   * Add custom parser
   */
  registerParser(language: string, parser: LanguageParser): void {
    this.parsers.set(language, parser);
  }

  /**
   * Remove parser
   */
  unregisterParser(language: string): boolean {
    return this.parsers.delete(language);
  }
}

// Export singleton instance
export const parserManager = new ParserManager();

// Export parser classes
export { TypeScriptParser };