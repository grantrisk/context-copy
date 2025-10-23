# Context Copy (`ccopy`)

`context-copy` is a powerful and configurable command-line tool that recursively scans a project directory, concatenates the contents of relevant files into a single string, and copies it to your clipboard.

It's designed to make it easy to grab the entire context of a codebase for use in Large Language Models (LLMs) like GPT-4, Claude, or Gemini.

## ✨ Features

-   **Recursive Directory Scanning**: Scans an entire project directory from the root.
-   **Smart Ignoring**: Automatically ignores common unnecessary files and directories (like `node_modules`, `.git`, build artifacts, and binaries).
-   **`.gitignore` Integration**: Automatically respects rules found in your project's `.gitignore` files.
-   **Custom Ignore Rules**: Supports a `.contextignore` file for project-specific rules that shouldn't be in `.gitignore`.
-   **Single File Mode**: Can be pointed at a single file for quick copying.
-   **Informative Output**: Displays a tree of copied files and color-coded stats on the context size.
-   **Clipboard Integration**: Copies the final formatted context directly to your system's clipboard.
-   **Alias**: Comes with a convenient `ccopy` alias for quicker use.

## 🚀 Installation

You can install `context-copy` globally using npm, which will make the `context-copy` and `ccopy` commands available in your terminal.

```bash
npm install -g context-copy
```

## Usage

The command is simple and intuitive.

### Copy an Entire Directory
To copy the current directory, simply run:

```Bash
ccopy
```

Or target a specific directory:

```Bash
ccopy /path/to/your/project
```

### Copy a Single File
You can also pass a path to a single file:

```Bash
ccopy src/main.js
```

### Options
`-i, --ignore-file <path>`: Specify a path to a custom ignore file. The default is .contextignore.

```Bash
ccopy . --ignore-file ./.customignore
```

## How It Works

1. Scan: The tool starts at the specified path (or the current directory).
2. Ignore: It gathers a list of ignore patterns from its own sensible defaults, any `.gitignore` files it finds, and an optional custom ignore file (`.contextignore` by default).
3. Read: It reads the contents of every file that is not ignored.
4. Format: It concatenates the contents, adding a header before each file's content (e.g., `=== File: src/main.js ===`).
5. Copy: The entire formatted string is copied to the clipboard.
6. Report: A summary is printed to the console, showing a file tree, the number of files copied, and the total size of the context.
