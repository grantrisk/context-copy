import chalk from 'chalk'
import { buildFileTree, countTokens, getContextSizeColor } from './utils.js'

function calculateLineCounts(node, fileLineCounts, currentPath = '') {
    let lineCounts = {}
    let totalLines = 0

    const entries = Object.keys(node)
    entries.sort((a, b) => {
        const aIsFile = node[a] === null
        const bIsFile = node[b] === null
        if (aIsFile && !bIsFile) return 1
        if (!aIsFile && bIsFile) return -1
        return a.localeCompare(b)
    })

    for (const entry of entries) {
        const fullPath = currentPath ? `${currentPath}/${entry}` : entry
        if (node[entry] === null) {
            // It's a file
            const lineCount = fileLineCounts[fullPath] || 0
            lineCounts[fullPath] = lineCount
            totalLines += lineCount
        } else {
            // It's a directory
            const {
                lineCounts: childLineCounts,
                totalLines: childTotalLines,
            } = calculateLineCounts(node[entry], fileLineCounts, fullPath)
            Object.assign(lineCounts, childLineCounts)
            lineCounts[fullPath] = childTotalLines
            totalLines += childTotalLines
        }
    }

    return { lineCounts, totalLines }
}

/**
 * Recursively prints the file tree structure to the console.
 * @param {object} node - The current node (directory) in the tree.
 * @param {string} prefix - The string prefix (connectors) to prepend.
 * @param {object} lineCounts - A map of file paths to their line counts.
 * @param {string} currentPath - The current path of the node.
 */
function printFileTree(node, prefix, lineCounts, currentPath = '') {
    const entries = Object.keys(node)
    entries.sort((a, b) => {
        const aIsFile = node[a] === null
        const bIsFile = node[b] === null
        if (aIsFile && !bIsFile) return 1
        if (!aIsFile && bIsFile) return -1
        return a.localeCompare(b)
    })

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const isLastEntry = i === entries.length - 1
        const childNode = node[entry]
        const fullPath = currentPath ? `${currentPath}/${entry}` : entry

        const connector = isLastEntry ? '└─' : '├─'
        const childPrefix = isLastEntry ? '  ' : '│ '

        const lineCount = lineCounts[fullPath] || 0
        const lineCountStr = chalk.gray(`(${lineCount} lines)`)

        console.log(`${prefix}${connector} ${entry} ${lineCountStr}`)

        if (childNode !== null) {
            printFileTree(
                childNode,
                prefix + childPrefix,
                lineCounts,
                fullPath
            )
        }
    }
}

/**
 * Displays the final summary report to the console.
 * @param {string} content - The concatenated content.
 * @param {number} fileCount - The number of files processed.
 * @param {string[]} fileList - The list of processed files.
 * @param {object} fileLineCounts - A map of file paths to their line counts from processing.
 * @param {object} options - Additional options (if any).
 */
export function displaySummary(
    content,
    fileCount,
    fileList,
    fileLineCounts,
    options = {}
) {
    console.log(chalk.blue.bold('\n--- Copied Files ---'))
    const fileTree = buildFileTree(fileList)
    const { lineCounts } = calculateLineCounts(fileTree, fileLineCounts)
    printFileTree(fileTree, '', lineCounts)

    const charCount = content.length
    const lineCount = content.split('\n').length
    const tokenCount = countTokens(content)
    const contentSizeKB = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(2)
    const color = getContextSizeColor(tokenCount)

    const successMessage = options.output
        ? `\n✅ Success! Saved ${fileCount} files to ${options.output}.`
        : `\n✅ Success! Copied ${fileCount} files to the clipboard.`

    console.log(chalk.bold(color(successMessage)))
    console.log(color(`   Total Tokens (est.): ${tokenCount.toLocaleString()}`))
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
