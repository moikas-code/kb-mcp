# KB Entries vs Markdown Files Issue

## The Problem
You noticed JSON entries in `/kb/entries/` with empty content instead of markdown files.

## Root Cause
There are **two different KB systems** at play:

### 1. NPM-installed KB CLI (v1.2.1)
- Creates JSON metadata in `/kb/entries/` directory
- Stores entries like: `{id, title, content: '', tags, created_at, updated_at}`
- The content is empty because it expects a different backend

### 2. Our Project's KB System  
- Uses direct markdown files in directories
- Expects structure like: `/kb/active/ISSUE.md`, `/kb/docs/guide.md`
- Integrated with BackendManager for filesystem/graph switching

## What Happened
1. You used `kb write "kb/active/CLI_CONSOLIDATION.md" "content"`
2. The NPM CLI created `/kb/entries/mcv60mwm5e06078m9al.json` with empty content
3. No actual markdown file was created in `/kb/active/`
4. The `/kb/active/` directory doesn't even exist

## Solution
We need to:
1. Use our project's CLI (once fixed) instead of the NPM version
2. Or manually create the proper directory structure
3. Or update the NPM CLI to match our backend

## Current Status
- Our unified CLI has build issues with path aliases
- The NPM CLI uses a different storage format
- Need to decide which approach to standardize on