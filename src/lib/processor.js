import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import {glob} from 'glob'

/**
 * Processes a directory, reads non-ignored files, and concatenates their content.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processDirectory(dirPath, ignorePatterns) {
    const allFiles = await glob('**/*', {
        cwd: dirPath,
        dot: true, // Include dotfiles
        nodir: true, // Exclude directories from the result set
        ignore: ignorePatterns,
    })

    let concatenatedContent = ''
    const fileList = []

    for (const file of allFiles) {
        const fullPath = path.join(dirPath, file)
        try {
            const fileContent = await fs.readFile(fullPath, 'utf-8')
            // Use the relative path from the glob result directly
            const relativePath = file

            concatenatedContent += `=== File: ${relativePath} ===\n\n`
            concatenatedContent += fileContent
            concatenatedContent += '\n\n'
            fileList.push(relativePath)
        } catch (err) {
            console.warn(chalk.yellow(`Skipping unreadable file: ${file}`))
        }
    }

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
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processSingleFile(filePath, projectRoot) {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const relativePath = path.relative(projectRoot, filePath)

    let concatenatedContent = `=== File: ${relativePath} ===\n\n`
    concatenatedContent += fileContent
    concatenatedContent += '\n\n'

    return {
        content: concatenatedContent,
        fileCount: 1,
        fileList: [relativePath],
    }
}