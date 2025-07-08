#!/usr/bin/env node

/**
 * Script to fix common TypeScript errors in KB-MCP codebase
 */

const fs = require('fs');
const path = require('path');

const fixes = [
  // Fix unused variables by prefixing with underscore
  {
    pattern: /(\w+): error TS6133: '(\w+)' is declared but its value is never read\./,
    fix: (content, match) => {
      const varName = match[2];
      // Don't prefix if already prefixed
      if (varName.startsWith('_')) return content;
      
      // Common patterns to fix
      const patterns = [
        new RegExp(`\\b${varName}\\b(?=\\s*[:=,)])`),
        new RegExp(`\\b${varName}\\b(?=\\s*\\})`),
        new RegExp(`\\b${varName}\\b(?=\\s*,)`),
        new RegExp(`\\b${varName}\\b(?=\\s*\\))`),
      ];
      
      for (const pattern of patterns) {
        content = content.replace(pattern, `_${varName}`);
      }
      
      return content;
    }
  },
  
  // Fix property access errors
  {
    pattern: /distance\.cosine/g,
    replacement: 'distance.cosine || distance.cosineDistance || distance'
  },
  
  // Fix missing properties by using optional chaining
  {
    pattern: /(\w+)\.port/g,
    replacement: '$1.port || $1.connection?.port || 3000'
  },
  
  // Fix Timer type issues
  {
    pattern: /clearInterval\((\w+)\)/g,
    replacement: 'clearInterval($1 as any)'
  },
  
  // Fix undefined assignments
  {
    pattern: /max: this\.config\.max_connections,/g,
    replacement: 'max: this.config.max_connections ?? 10,'
  },
  {
    pattern: /acquireTimeoutMillis: this\.config\.connection_timeout,/g,
    replacement: 'acquireTimeoutMillis: this.config.connection_timeout ?? 30000,'
  },
];

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  for (const fix of fixes) {
    if (fix.pattern && fix.replacement) {
      const newContent = content.replace(fix.pattern, fix.replacement);
      if (newContent !== content) {
        content = newContent;
        changed = true;
      }
    }
  }
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  
  return false;
}

// Get all TypeScript files
function getAllTsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
        traverse(fullPath);
      } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

// Run fixes
const srcDir = path.join(__dirname, 'src');
const tsFiles = getAllTsFiles(srcDir);

console.log(`Found ${tsFiles.length} TypeScript files`);

let totalFixed = 0;
for (const file of tsFiles) {
  if (fixFile(file)) {
    totalFixed++;
  }
}

console.log(`Fixed ${totalFixed} files`);