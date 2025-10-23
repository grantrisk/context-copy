import fs from "fs/promises";
import path from "path";
import clipboard from "clipboardy";
import chalk from "chalk";
import { glob } from "glob";

// --- Default Ignore Patterns ---
const DEFAULT_IGNORE_PATTERNS = [
    // --- Configuration/Meta ---
    "**/.env*",
    "**/*.log",
    "**/*.swp", // Vim swap files
    "**/*.bak", // Backup files
    "**/*~", // Editor temporary files
    "**/.DS_Store",
    "**/thumbs.db", // Windows cache
    "**/Desktop.ini", // Windows metadata
    "**/*.iml", // IntelliJ IDEA module files

    // --- Dependency/Lock Files ---
    "**/yarn.lock",
    "**/package-lock.json",
    "**/Pipfile.lock", // Python lock file
    "**/go.sum", // Go lock file

    // --- Critical Build/Dependency Directories ---
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.idea/**",
    "**/coverage/**", // Test reports
    "**/tmp/**", // Temporary files
    "**/temp/**", // Temporary files
    "**/log/**", // Log directory
    "**/out/**", // Common output
    "**/target/**", // Rust/Java build output
    "**/vendor/**", // Third-party dependencies

    // --- Compiled/Generated Files/Code ---
    "**/*.min.js", // Minified JavaScript
    "**/*.pyc",
    "**/__pycache__/**", // Python cache directory
    "**/*.class", // Java compiled
    "**/*.jar", // Java archives
    "**/*.o", // Compiled objects
    "**/*.swo",

    // --- Binary and Archive Files (Existing) ---
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.gif",
    "**/*.ico",
    "**/*.svg",
    "**/*.webp",
    "**/*.pdf",
    "**/*.doc",
    "**/*.docx",
    "**/*.xls",
    "**/*.xlsx",
    "**/*.ppt",
    "**/*.pptx",
    "**/*.zip",
    "**/*.tar",
    "**/*.gz",
    "**/*.rar",
    "**/*.mp3",
    "**/*.mp4",
    "**/*.mov",
    "**/*.avi",
];

// --- Context Size Thresholds ---
// Define thresholds for context size coloring (in characters)
const CONTEXT_SIZE_THRESHOLDS = {
    low: 10000, // Up to 10k chars (approx 2.5k tokens) - Green
    medium: 50000, // Up to 50k chars (approx 12.5k tokens) - Yellow
    high: 100000, // Up to 100k chars (approx 25k tokens) - Orange
    // Over 100k chars will be Red
};

/**
 * Gets the appropriate chalk color based on the content size.
 * @param {number} charCount - The total number of characters.
 * @returns {chalk.Chalk} - A chalk color function.
 */
function getContextSizeColor(charCount) {
    if (charCount <= CONTEXT_SIZE_THRESHOLDS.low) {
        return chalk.green;
    }
    if (charCount <= CONTEXT_SIZE_THRESHOLDS.medium) {
        return chalk.yellow;
    }
    if (charCount <= CONTEXT_SIZE_THRESHOLDS.high) {
        return chalk.hex("#FFA500"); // Orange
    }
    return chalk.red;
}

/**
 * Loads ignore patterns from default, .gitignore, and custom ignore files.
 * @param {string} rootPath - The root directory of the project.
 * @param {string} customIgnoreFileName - The name of the custom ignore file.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ignore patterns.
 */
async function loadIgnorePatterns(rootPath, customIgnoreFileName) {
    const allPatterns = new Set(DEFAULT_IGNORE_PATTERNS);

    // Helper to read and parse an ignore file
    const parseIgnoreFile = async (filePath) => {
        try {
            const content = await fs.readFile(filePath, "utf-8");
            content
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith("#"))
                .forEach((pattern) => allPatterns.add(pattern));
        } catch (error) {
            if (error.code !== "ENOENT") {
                console.warn(chalk.yellow(`Warning: Could not read ignore file at ${filePath}.`));
            }
        }
    };

    // 1. Read .gitignore
    await parseIgnoreFile(path.resolve(rootPath, ".gitignore"));

    // 2. Read custom ignore file (e.g., .contextignore)
    await parseIgnoreFile(path.resolve(rootPath, customIgnoreFileName));

    return [...allPatterns];
}

/**
 * Builds a nested object (tree) from a flat list of file paths.
 * @param {string[]} fileList - A flat list of file paths.
 * @returns {object} - A nested object representing the file structure.
 */
function buildFileTree(fileList) {
    const tree = {};

    for (const filePath of fileList) {
        // Glob always uses forward slashes, which is great for consistency
        const parts = filePath.split("/");
        let currentNode = tree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLastPart = i === parts.length - 1;

            if (isLastPart) {
                // This is a file
                currentNode[part] = null; // Use null to mark a file
            } else {
                // This is a directory
                if (!currentNode[part]) {
                    currentNode[part] = {};
                }
                currentNode = currentNode[part];
            }
        }
    }
    return tree;
}

/**
 * Recursively prints the file tree structure to the console.
 * @param {object} node - The current node (directory) in the tree.
 * @param {string} prefix - The string prefix (connectors) to prepend.
 */
function printFileTree(node, prefix) {
    const entries = Object.keys(node);
    entries.sort((a, b) => {
        // Sort directories before files
        const aIsFile = node[a] === null;
        const bIsFile = node[b] === null;
        if (aIsFile && !bIsFile) return 1;
        if (!aIsFile && bIsFile) return -1;
        return a.localeCompare(b); // Alphabetical sort for same types
    });

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLastEntry = i === entries.length - 1;
        const childNode = node[entry];

        const connector = isLastEntry ? "└─" : "├─";
        const childPrefix = isLastEntry ? "  " : "│ ";

        console.log(chalk.gray(prefix + connector) + ` ${entry}`);

        if (childNode !== null) {
            // It's a directory, recurse
            printFileTree(childNode, prefix + childPrefix);
        }
    }
}

/**
 * Processes a directory, reads non-ignored files, and concatenates their content.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
async function processDirectory(dirPath, ignorePatterns) {
    const allFiles = await glob("**/*", {
        cwd: dirPath,
        dot: true, // Include dotfiles
        nodir: true, // Exclude directories from the result set
        ignore: ignorePatterns,
    });

    let concatenatedContent = "";
    const fileList = [];

    for (const file of allFiles) {
        const fullPath = path.join(dirPath, file);
        try {
            const fileContent = await fs.readFile(fullPath, "utf-8");
            // Use the relative path from the glob result directly
            const relativePath = file;

            concatenatedContent += `=== File: ${relativePath} ===\n\n`;
            concatenatedContent += fileContent;
            concatenatedContent += "\n\n";
            fileList.push(relativePath);
        } catch (err) {
            console.warn(chalk.yellow(`Skipping unreadable file: ${file}`));
        }
    }

    return { content: concatenatedContent, fileCount: fileList.length, fileList };
}

/**
 * Processes a single file.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
async function processSingleFile(filePath) {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const fileName = path.basename(filePath);

    let concatenatedContent = `=== File: ${fileName} ===\n\n`;
    concatenatedContent += fileContent;
    concatenatedContent += "\n\n";

    return {
        content: concatenatedContent,
        fileCount: 1,
        fileList: [fileName],
    };
}

/**
 * Displays the final summary report to the console.
 * @param {string} content - The concatenated content.
 * @param {number} fileCount - The number of files processed.
 * @param {string[]} fileList - The list of processed files.
 */
function displaySummary(content, fileCount, fileList) {
    console.log(chalk.blue.bold("\n--- Copied Files ---"));
    const fileTree = buildFileTree(fileList);
    printFileTree(fileTree, "");

    const charCount = content.length;
    const lineCount = content.split("\n").length;
    const contentSizeKB = (Buffer.byteLength(content, "utf8") / 1024).toFixed(2);
    const color = getContextSizeColor(charCount);

    console.log(chalk.bold(color(`\n✅ Success! Copied ${fileCount} files to the clipboard.`)));
    console.log(color(`   Total Lines: ${lineCount.toLocaleString()}`));
    console.log(color(`   Total Chars: ${charCount.toLocaleString()}`));
    console.log(color(`   Total Size: ${contentSizeKB} KB`));

    if (color === chalk.red || color === chalk.hex("#FFA500")) {
        console.log(
            color.bold("   Warning: Context size is very large. This may exceed model limits.")
        );
    }
}

/**
 * The main function that orchestrates the entire process.
 * @param {string} targetPath - The full path to the project directory or file.
 * @param {object} options - The CLI options from commander.
 */
export async function main(targetPath, options) {
    try {
        console.log(chalk.blue(`🚀 Scanning path: ${targetPath}`));

        const stats = await fs.stat(targetPath);
        let result;

        if (stats.isDirectory()) {
            const ignorePatterns = await loadIgnorePatterns(targetPath, options.ignoreFile);
            result = await processDirectory(targetPath, ignorePatterns);
        } else if (stats.isFile()) {
            result = await processSingleFile(targetPath);
        } else {
            throw new Error("The specified path is not a file or a directory.");
        }

        const { content, fileCount, fileList } = result;

        if (fileCount === 0) {
            console.log(chalk.yellow("No files were read. Nothing to copy."));
            return;
        }

        await clipboard.write(content);
        displaySummary(content, fileCount, fileList);
    } catch (error) {
        console.error(chalk.red.bold("\n❌ An error occurred:"));
        console.error(chalk.red(error.message));
        process.exit(1);
    }
}
