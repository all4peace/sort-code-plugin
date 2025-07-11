# Sort Code Plugin

A VS Code extension that sorts TypeScript and JavaScript functions alphabetically with public functions appearing on top.

## Features

- Sort functions alphabetically within TypeScript and JavaScript files
- Public functions are placed before private functions
- Preserves function formatting and comments
- Works with classes, interfaces, and top-level functions
- Supports TypeScript, JavaScript, TSX, and JSX files

## Usage

### Commands

- **Sort Functions in Current File**: Sort functions in the current file

### Keyboard Shortcuts

- `Ctrl+M Ctrl+Z` (Windows/Linux) or `Cmd+M Cmd+Z` (Mac): Sort functions in current file

### How to Use

1. Open a TypeScript or JavaScript file
2. Use the command palette (`Ctrl+Shift+P`) and search for "Sort Functions"
3. Or right-click in the editor and select "Sort Functions in Current File"
4. Or use the keyboard shortcut `Ctrl+M Ctrl+Z` (chord: press Ctrl+M, then Ctrl+Z)

## Requirements

- VS Code 1.74.0 or higher

## Extension Settings

This extension does not contribute any settings currently.

## Known Issues

- Large files may take a moment to process
- Complex nested functions might require manual review

## Release Notes

### 1.0.0

Initial release of Sort Code Plugin with basic function sorting capabilities.

## Development

To develop this extension:

1. Clone the repository
2. Run `npm install` to install dependencies
3. Press `F5` to open a new Extension Development Host window
4. Test the extension in the new window

## License

MIT
