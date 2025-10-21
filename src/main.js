import fs from "fs/promises";
import path from "path";
import clipboard from "clipboardy";
import chalk from "chalk";
import { glob } from "glob";

// --- Default Ignore Patterns ---
const DEFAULT_IGNORE_PATTERNS = [
    ".env*",
    "**/.env*",
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "*.log",
    "yarn.lock",
    "package-lock.json",
    "*.pyc",
    "*.swo",
    ".DS_Store",
    // Binary file extensions
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.ico",
    "*.svg",
    "*.webp",
    "*.pdf",
    "*.doc",
    "*.docx",
    "*.xls",
    "*.xlsx",
    "*.ppt",
    "*.pptx",
    "*.zip",
    "*.tar",
    "*.gz",
    "*.rar",
    "*.mp3",
    "*.mp4",
    "*.mov",
    "*.avi",
];

/**
 * Loads ignore patterns from a specified file and merges them with defaults.
 * @param {string} rootPath - The root directory of the project.
 * @param {string} ignoreFilePath - The path to the custom ignore file.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ignore patterns.
 */
async function loadIgnorePatterns(rootPath, ignoreFilePath) {
    const customIgnorePath = path.resolve(rootPath, ignoreFilePath);
    let customPatterns = [];
    try {
        const content = await fs.readFile(customIgnorePath, "utf-8");
        customPatterns = content.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
    } catch (error) {
        // It's okay if the ignore file doesn't exist.
        if (error.code !== "ENOENT") {
            console.warn(
                chalk.yellow(`Warning: Could not read custom ignore file at ${customIgnorePath}.`)
            );
        }
    }
    return [...DEFAULT_IGNORE_PATTERNS, ...customPatterns];
}

/**
 * Recursively scans a directory, reads non-ignored files, and concatenates their content.
 * @param {string} dirPath - The directory to scan.
 * @param {string} rootPath - The project's root path for relative path calculation.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number}>} - The concatenated content and file count.
 */
async function processDirectory(dirPath, rootPath, ignorePatterns) {
    const allFiles = await glob("**/*", {
        cwd: dirPath,
        dot: true, // Include dotfiles
        nodir: true, // Exclude directories from the result set
        ignore: ignorePatterns,
    });

    let concatenatedContent = "";
    let filesRead = 0;

    for (const file of allFiles) {
        const fullPath = path.join(dirPath, file);
        try {
            const fileContent = await fs.readFile(fullPath, "utf-8");
            const relativePath = path.relative(rootPath, fullPath);

            concatenatedContent += `=== File: ${relativePath} ===\n\n`;
            concatenatedContent += fileContent;
            concatenatedContent += "\n\n";
            filesRead++;
        } catch (err) {
            console.warn(chalk.yellow(`Skipping unreadable file: ${file}`));
        }
    }

    return { content: concatenatedContent, fileCount: filesRead };
}

/**
 * The main function that orchestrates the entire process.
 * @param {string} projectPath - The full path to the project directory.
 * @param {object} options - The CLI options from commander.
 */
export async function main(projectPath, options) {
    try {
        console.log(chalk.blue(`🚀 Starting to scan directory: ${projectPath}`));

        const stats = await fs.stat(projectPath);
        if (!stats.isDirectory()) {
            throw new Error("The specified path is not a directory.");
        }

        const ignorePatterns = await loadIgnorePatterns(projectPath, options.ignoreFile);
        const { content, fileCount } = await processDirectory(
            projectPath,
            projectPath,
            ignorePatterns
        );

        if (fileCount === 0) {
            console.log(
                chalk.yellow("No files were read after applying ignore rules. Nothing to copy.")
            );
            return;
        }

        await clipboard.write(content);

        const contentSizeKB = (Buffer.byteLength(content, "utf8") / 1024).toFixed(2);
        console.log(
            chalk.green.bold(
                `\n✅ Success! Copied the content of ${fileCount} files (${contentSizeKB} KB) to the clipboard.`
            )
        );
    } catch (error) {
        console.error(chalk.red.bold("\n❌ An error occurred:"));
        console.error(chalk.red(error.message));
        process.exit(1);
    }
}
