import fs from 'fs/promises'
import clipboard from 'clipboardy'
import chalk from 'chalk'
import path from 'path'
import { findProjectRoot, loadIgnorePatterns } from './lib/config.js'
import { processDirectory, processSingleFile } from './lib/processor.js'
import { processFileWithImports } from './lib/parser.js'
import {
    buildFileTree,
    formatFileTreeForContext,
    createDebugger,
} from './lib/utils.js'
import { displaySummary } from './lib/display.js'

/**
 * The main function that orchestrates the entire process.
 * @param {string[]} targetPaths - An array of full paths to the project directories or files.
 * @param {object} options - The CLI options from commander.
 */
export async function main(targetPaths, options) {
    const debug = createDebugger(options.debug)
    debug(chalk.gray('Debug mode is ON'))
    debug(chalk.gray(`Received paths: ${targetPaths.join(', ')}`))

    try {
        // Determine Project Root
        // We use the first path to find the project root. This is used for .gitignore
        // and alias resolution. We assume all files belong to the same project context.
        const primaryPath = targetPaths[0]
        const statsFirst = await fs.stat(primaryPath)
        let projectRoot

        if (statsFirst.isDirectory()) {
            projectRoot = primaryPath
        } else {
            projectRoot = await findProjectRoot(primaryPath, debug)
        }

        console.log(chalk.blue(`🚀 Scanning context...`))
        debug(chalk.blue(`Determined project root: ${projectRoot}`))

        // Load ignore patterns relative to the root
        const ignorePatterns = await loadIgnorePatterns(
            projectRoot,
            options.ignoreFile,
            debug
        )

        // Process all paths
        let aggregateContent = ''
        const aggregateFileList = []
        const aggregateLineCounts = {}

        // Track absolute paths to prevent duplicates across multiple arguments
        const globalProcessedFiles = new Set()

        for (const targetPath of targetPaths) {
            const stats = await fs.stat(targetPath)
            let result

            if (stats.isDirectory()) {
                debug(chalk.magenta(`Processing Directory: ${targetPath}`))
                result = await processDirectory(
                    targetPath, // This specific dir
                    ignorePatterns,
                    options,
                    debug
                )
            } else if (stats.isFile()) {
                debug(chalk.magenta(`Processing File: ${targetPath}`))
                // Check if we already processed this file (e.g. via previous argument)
                if (globalProcessedFiles.has(targetPath)) {
                    debug(
                        chalk.yellow(
                            `Skipping duplicate file argument: ${targetPath}`
                        )
                    )
                    continue
                }

                if (options.followImports) {
                    console.log(
                        chalk.blue(
                            `Following imports for ${path.basename(
                                targetPath
                            )} (${options.deep ? 'deep' : 'shallow'})...`
                        )
                    )
                    result = await processFileWithImports(
                        targetPath,
                        projectRoot,
                        options,
                        ignorePatterns,
                        debug
                    )
                } else {
                    result = await processSingleFile(
                        targetPath,
                        projectRoot,
                        debug
                    )
                }
            } else {
                console.warn(
                    chalk.yellow(`Skipping invalid path: ${targetPath}`)
                )
                continue
            }

            // Merge Results
            if (result && result.fileList) {
                // Filter out duplicates based on the global set
                // Note: result.fileList contains relative paths
                for (const relativeFile of result.fileList) {
                    const absPath = path.resolve(projectRoot, relativeFile)

                    if (!globalProcessedFiles.has(absPath)) {
                        globalProcessedFiles.add(absPath)
                        aggregateFileList.push(relativeFile)
                    }
                }

                // Append content
                aggregateContent += result.content

                // Merge line counts
                Object.assign(aggregateLineCounts, result.fileLineCounts)
            }
        }

        let content = aggregateContent
        const fileCount = aggregateFileList.length
        const fileList = aggregateFileList

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

        debug(chalk.gray('Final result content generated.'))

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
                debug(chalk.gray(`Saving context to file: ${outputPath}`))
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
            debug(chalk.gray('Copying context to clipboard.'))
            await clipboard.write(content)
        }

        displaySummary(
            content,
            fileCount,
            fileList,
            aggregateLineCounts,
            options
        )
    } catch (error) {
        console.error(chalk.red.bold('\n❌ An error occurred:'))
        console.error(chalk.red(error.message))
        // console.error(error.stack) // Uncomment for deep debugging
        throw error // Re-throw to allow process to exit with error
    }
}
