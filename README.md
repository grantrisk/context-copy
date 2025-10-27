# Context Copy (`ccopy`)

`context-copy` is a powerful and configurable command-line tool that recursively scans a project directory, concatenates the contents of relevant files into a single string, and copies it to your clipboard.

It's designed to make it easy to grab the entire context of a codebase for use in Large Language Models (LLMs) like GPT-4, Claude, or Gemini.

## ✨ Features

  - **Recursive Directory Scanning**: Scans an entire project directory from the root.
  - **Smart Ignoring**: Automatically ignores common unnecessary files and directories (like `node_modules`, `.git`, build artifacts, and binaries).
  - **`.gitignore` Integration**: Automatically respects rules found in your project's `.gitignore` files.
  - **Custom Ignore Rules**: Supports a `.contextignore` file for project-specific rules that shouldn't be in `.gitignore`.
  - **Single File Mode**: Can be pointed at a single file for quick copying.
  - **Smart Import Following**: When pointing to a single file, can optionally follow and copy all local imported files (`--follow-imports`).
  - **Alias Aware**: Understands `jsconfig.json`/`tsconfig.json` path aliases (e.g., `@/*`).
  - **Deep/Shallow Mode**: Control import following to be "shallow" (direct imports only) or "deep" (recursive).
  - **Informative Output**: Displays a tree of copied files and color-coded stats on the context size.
  - **Clipboard Integration**: Copies the final formatted context directly to your system's clipboard.
  - **Alias**: Comes with a convenient `ccopy` alias for quicker use.

## 🚀 Installation

You can install `context-copy` globally using npm, which will make the `context-copy` and `ccopy` commands available in your terminal.

```bash
npm install -g context-copy
```

-----

## Usage

The command is simple and intuitive. You can use either `context-copy` or the shorter `ccopy` alias.

### Copy an Entire Directory

To copy the current directory, simply run:

```bash
ccopy
```

Or target a specific directory:

```bash
ccopy /path/to/your/project
```

### Copy a Single File with Imports

You can pass a path to a single file. For more advanced context gathering, use the import following options.

To copy `src/main.js` and all **direct** local files it imports (shallow copy):

```bash
ccopy src/main.js --follow-imports
```

To **recursively** copy all imports (imports of imports, etc.):

```bash
ccopy src/main.js --follow-imports --deep
```

-----

## Command Options

| Option | Alias | Argument | Description | Default |
| :--- | :--- | :--- | :--- | :--- |
| `--ignore-file` | `-i` | `<path>` | Path to a custom ignore file, like a `.contextignore`. Rules in this file are merged with defaults and `.gitignore`. | `.contextignore` |
| `--follow-imports` | `-f` | | When used with a single file, it enables tracing and including **local** imports (relative and aliased) into the context. | Off (Directory Scan) |
| `--deep` | `-d` | | Recursively follow imports (imports of imports, up to $\text{Infinity}$ depth). This option requires `--follow-imports` to be active. | Off (Shallow Trace) |
| `--version` | `-V` | | Output the version number. | |
| `--help` | `-h` | | Display help for command. | |

-----

## How It Works

1.  **Scan**: The tool starts at the specified path (or the current directory).
2.  **Ignore**: It gathers a list of ignore patterns from its own sensible defaults, any `.gitignore` files it finds, and an optional custom ignore file (`.contextignore` by default).
3.  **Read**: It reads the contents of every file that is not ignored.
      - **Import Following**: If run on a single file with `--follow-imports`, it parses the file, resolves local/aliased imports, and adds them to a queue to be read.
4.  **Format**: It concatenates the contents, adding a header before each file's content (e.g., `=== File: src/main.js ===`).
5.  **Copy**: The entire formatted string is copied directly to your system's clipboard.
6.  **Report**: A summary is printed to the console, showing a file tree, the number of files copied, and the total size of the context.