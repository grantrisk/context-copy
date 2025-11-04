import fs from 'fs/promises'
import clipboard from 'clipboardy'
import chalk from 'chalk'
import path from 'path'
import { findProjectRoot, loadIgnorePatterns } from './lib/config.js'
import { processDirectory, processSingleFile } from './lib/processor.js'
import { processFileWithImports } from './lib/parser.js'
import { buildFileTree, formatFileTreeForContext } from './lib/utils.js'
import { displaySummary } from './lib/display.js'

/**
 * The main function that orchestrates the entire process.
 * @param {string} targetPath - The full path to the project directory or file.
 * @param {object} options - The CLI options from commander.
 */
export async function main(targetPath, options) {
    try {
        const stats = await fs.stat(targetPath)
        let result
        let projectRoot

        // 1. Find project root first for context (aliases, ignores)
        if (stats.isDirectory()) {
            projectRoot = targetPath
        } else {
            projectRoot = await findProjectRoot(targetPath)
        }
        console.log(chalk.blue(`🚀 Scanning path: ${targetPath}`))
        if (projectRoot !== targetPath) {
            console.log(chalk.blue(`Found project root: ${projectRoot}`))
        }

        // 2. Load ignore patterns relative to the root
        const ignorePatterns = await loadIgnorePatterns(
            projectRoot,
            options.ignoreFile
        )

        // 3. Decide processing strategy
        if (stats.isDirectory()) {
            result = await processDirectory(projectRoot, ignorePatterns)
        } else if (stats.isFile()) {
            if (options.followImports) {
                console.log(
                    chalk.blue(
                        `Following imports (${
                            options.deep ? 'deep' : 'shallow'
                        })...`
                    )
                )
                result = await processFileWithImports(
                    targetPath,
                    projectRoot,
                    options,
                    ignorePatterns
                )
            } else {
                result = await processSingleFile(targetPath, projectRoot)
            }
        } else {
            throw new Error('The specified path is not a file or a directory.')
        }

        let { content } = result
        const { fileCount, fileList } = result

        if (fileCount === 0) {
            console.log(chalk.yellow('No files were read. Nothing to copy.'))
            return
        }

        if (options.prependTree) {
            console.log(
                chalk.blue.bold('🌲 Prepending file tree to context...')
            )
            const fileTreeObject = buildFileTree(fileList)
            const treeString = formatFileTreeForContext(fileTreeObject)

            const treeHeader =
                '=====================================\n' +
                '==== PROJECT FILE STRUCTURE TREE ====\n' +
                '=====================================\n\n'
            const treeFooter =
                '\n=====================================\n' +
                '==== END FILE STRUCTURE TREE ====\n' +
                '=====================================\n\n\n'

            content = treeHeader + treeString + treeFooter + content
        }

        if (options.output) {
            // If an output path is provided
            let outputPath = path.resolve(options.output)

            try {
                // Check if the provided path already exists and is a directory
                const stats = await fs.stat(outputPath)
                if (stats.isDirectory()) {
                    console.log(
                        chalk.blue(
                            `Output path is a directory. Appending default filename 'context.txt'.`
                        )
                    )
                    outputPath = path.join(outputPath, 'context.txt')

                    // Update options.output so displaySummary shows the correct path
                    options.output = path.relative(process.cwd(), outputPath)
                }
            } catch (e) {
                // ENOENT (Error, No Entry) means the file/dir doesn't exist, which is fine.
                // We'll create the file at that path.
                if (e.code !== 'ENOENT') {
                    throw e // Re-throw other errors (like permissions)
                }
            }

            await fs.writeFile(outputPath, content)
        } else {
            // Otherwise, use the clipboard
            await clipboard.write(content)
        }

        displaySummary(content, fileCount, fileList, options)
    } catch (error) {
        console.error(chalk.red.bold('\n❌ An error occurred:'))
        console.error(chalk.red(error.message))
        throw error // Re-throw to allow process to exit with error
    }
}
