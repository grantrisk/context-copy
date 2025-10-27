import chalk from 'chalk'
import {
    buildFileTree,
    countTokens,
    getContextSizeColor,
} from './utils.js'

/**
 * Recursively prints the file tree structure to the console.
 * @param {object} node - The current node (directory) in the tree.
 * @param {string} prefix - The string prefix (connectors) to prepend.
 */
function printFileTree(node, prefix) {
    const entries = Object.keys(node)
    entries.sort((a, b) => {
        // Sort directories before files
        const aIsFile = node[a] === null
        const bIsFile = node[b] === null
        if (aIsFile && !bIsFile) return 1
        if (!aIsFile && bIsFile) return -1
        return a.localeCompare(b) // Alphabetical sort for same types
    })

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const isLastEntry = i === entries.length - 1
        const childNode = node[entry]

        const connector = isLastEntry ? '└─' : '├─'
        const childPrefix = isLastEntry ? '  ' : '│ '

        console.log(chalk.gray(prefix + connector) + ` ${entry}`)

        if (childNode !== null) {
            // It's a directory, recurse
            printFileTree(childNode, prefix + childPrefix)
        }
    }
}

/**
 * Displays the final summary report to the console.
 * @param {string} content - The concatenated content.
 * @param {number} fileCount - The number of files processed.
 * @param {string[]} fileList - The list of processed files.
 */
export function displaySummary(content, fileCount, fileList) {
    console.log(chalk.blue.bold('\n--- Copied Files ---'))
    const fileTree = buildFileTree(fileList)
    printFileTree(fileTree, '')

    const charCount = content.length
    const lineCount = content.split('\n').length
    const tokenCount = countTokens(content)
    const contentSizeKB = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(2)
    const color = getContextSizeColor(tokenCount)

    console.log(
        chalk.bold(
            color(`\n✅ Success! Copied ${fileCount} files to the clipboard.`)
        )
    )
    console.log(
        color(`   Total Tokens (est.): ${tokenCount.toLocaleString()}`)
    )
    console.log(color(`   Total Lines: ${lineCount.toLocaleString()}`))
    console.log(color(`   Total Chars: ${charCount.toLocaleString()}`))
    console.log(color(`   Total Size: ${contentSizeKB} KB`))

    if (color === chalk.red || color === chalk.hex('#FFA500')) {
        console.log(
            color.bold(
                'Warning: Context size is very large. This may exceed model limits.'
            )
        )
    }
}