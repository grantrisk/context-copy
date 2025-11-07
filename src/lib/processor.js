import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { glob } from 'glob'

/**
 * Processes a directory, reads non-ignored files, and concatenates their content.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @param {object} options - The CLI options.
 * @param {function} debug - The optional debug logging function.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processDirectory(
    dirPath,
    ignorePatterns,
    options = {},
    debug = () => {}
) {
    debug(chalk.bold.magenta(`--- Starting Directory Scan: ${dirPath} ---`))

    // If includePatterns are provided, use them as the base patterns.
    // Otherwise, scan everything ('**/*').
    const patterns =
        options.includePatterns && options.includePatterns.length > 0
            ? options.includePatterns
            : ['**/*']

    debug(chalk.gray(`Using glob patterns: ${patterns.join(', ')}`))

    const allFiles = await glob(patterns, {
        cwd: dirPath,
        dot: true, // Include dotfiles
        nodir: true, // Exclude directories from the result set
        ignore: ignorePatterns,
    })

    debug(
        chalk.gray(
            `Found ${allFiles.length} files matching patterns and ignores.`
        )
    )

    let concatenatedContent = ''
    const fileList = []

    for (const file of allFiles) {
        const fullPath = path.join(dirPath, file)
        try {
            debug(chalk.cyan(`[FILE] Reading: ${file}`))
            const fileContent = await fs.readFile(fullPath, 'utf-8')
            // Use the relative path from the glob result directly
            const relativePath = file

            concatenatedContent += `=== File: ${relativePath} ===\n\n`
            concatenatedContent += fileContent
            concatenatedContent += '\n\n'
            fileList.push(relativePath)
            debug(
                chalk.green(`[SUCCESS] Added file content for: ${relativePath}`)
            )
        } catch (err) {
            console.warn(chalk.yellow(`Skipping unreadable file: ${file}`))
            debug(
                chalk.red(
                    `[ERROR] Failed to read file: ${file}. Error: ${err.message}`
                )
            )
        }
    }

    debug(
        chalk.bold.magenta(
            `--- Finished Directory Scan. Total files: ${fileList.length} ---`
        )
    )

    return {
        content: concatenatedContent,
        fileCount: fileList.length,
        fileList,
    }
}

/**
 * Processes a single file.
 * @param {string} filePath - The path to the file.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {function} debug - The optional debug logging function. <--- ADDED
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processSingleFile(
    filePath,
    projectRoot,
    debug = () => {}
) {
    debug(
        chalk.bold.magenta(`--- Starting Single File Process: ${filePath} ---`)
    )

    const relativePath = path.relative(projectRoot, filePath)
    debug(chalk.gray(`Relative path: ${relativePath}`))

    const fileContent = await fs.readFile(filePath, 'utf-8')
    debug(chalk.green(`Read file content successfully.`))

    let concatenatedContent = `=== File: ${relativePath} ===\n\n`
    concatenatedContent += fileContent
    concatenatedContent += '\n\n'

    debug(chalk.bold.magenta('--- Finished Single File Process ---'))

    return {
        content: concatenatedContent,
        fileCount: 1,
        fileList: [relativePath],
    }
}
