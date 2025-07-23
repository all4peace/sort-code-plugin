# Sort Code Plugin

A VS Code extension that sorts TypeScript and JavaScript code elements alphabetically with intelligent grouping and CodeMaid-style class member ordering.

## Features

- **Comprehensive Code Sorting**: Sorts functions, variables, classes, interfaces, enums, and exports
- **CodeMaid-Style Class Member Ordering**: Follows priority-based sorting within classes:
  - Constructor first
  - Public static methods
  - Public methods
  - Private static methods
  - Private methods
  - All sorted alphabetically within each priority group
- **Smart Export Handling**: `export default` statements are always placed last
- **Multi-line Statement Support**: Properly handles multi-line const declarations and complex statements
- **Comment Preservation**: Maintains all comments and formatting
- **Function Type Detection**: Supports all function types:
  - Regular function declarations: `function name() {}`
  - Arrow functions: `const name = () => {}`
  - Function expressions: `const name = function() {}`
  - Async functions: `async function name() {}`
  - Class methods with visibility modifiers
- **File Type Support**: Works with `.ts`, `.js`, `.tsx`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts` files

## Usage

### Commands

- **Sort Functions in Current File**: Sort all code elements in the current file

### Keyboard Shortcuts

- `Ctrl+M Ctrl+Z` (Windows/Linux) or `Cmd+M Cmd+Z` (Mac): Sort code in current file

### How to Use

1. Open a TypeScript or JavaScript file
2. Use the command palette (`Ctrl+Shift+P`) and search for "Sort Functions"
3. Or right-click in the editor and select "Sort Functions in Current File"
4. Or use the keyboard shortcut `Ctrl+M Ctrl+Z` (chord: press Ctrl+M, then Ctrl+Z)

## Sorting Logic

### Top-Level Elements

Elements are grouped and sorted in this order:

1. Import statements
2. Variables and constants
3. Interfaces
4. Enums
5. Classes
6. Export statements
7. Export default statements (always last)

### Class Members

Within classes, members are sorted using CodeMaid-style priorities:

1. **Constructor** - Always first
2. **Public static methods** - Sorted alphabetically
3. **Public methods** - Sorted alphabetically
4. **Private static methods** - Sorted alphabetically
5. **Private methods** - Sorted alphabetically

## Requirements

- VS Code 1.74.0 or higher

## Extension Settings

This extension does not contribute any settings currently.

## Release Notes

### 1.0.0

Initial release featuring:

- Comprehensive code sorting for TypeScript and JavaScript
- CodeMaid-style class member ordering
- Support for all function types and file extensions
- Smart export default handling
- Multi-line statement support

## Development

To develop this extension:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Press `F5` to open a new Extension Development Host window
4. Test the extension in the new window

## License

MIT
