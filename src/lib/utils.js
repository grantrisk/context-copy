import chalk from 'chalk'
import { get_encoding } from 'tiktoken'
import { CONTEXT_SIZE_THRESHOLDS } from './constants.js'

/**
 * Gets the appropriate chalk color based on the token count.
 * @param {number} tokenCount - The total number of tokens.
 * @returns {chalk.Chalk} - A chalk color function.
 */
export function getContextSizeColor(tokenCount) {
    if (tokenCount <= CONTEXT_SIZE_THRESHOLDS.low) {
        return chalk.green
    }
    if (tokenCount <= CONTEXT_SIZE_THRESHOLDS.medium) {
        return chalk.yellow
    }
    if (tokenCount <= CONTEXT_SIZE_THRESHOLDS.high) {
        return chalk.hex('#FFA500') // Orange
    }
    return chalk.red
}

/**
 * Estimates the number of tokens in a given text using tiktoken.
 * @param {string} text - The text to analyze.
 * @returns {number} - The estimated number of tokens.
 */
export function countTokens(text) {
    // "cl100k_base" is the encoding for gpt-4, gpt-3.5-turbo, and text-embedding-ada-002.
    try {
        const encoding = get_encoding('cl100k_base')
        const tokens = encoding.encode(text)
        encoding.free() // Important to free memory
        return tokens.length
    } catch (error) {
        console.warn(
            chalk.yellow(
                '\nWarning: \'tiktoken\' failed. Falling back to character-based token estimation.'
            )
        )
        // A common fallback is to assume ~4 characters per token.
        return Math.floor(text.length / 4)
    }
}

/**
 * Builds a nested object (tree) from a flat list of file paths.
 * @param {string[]} fileList - A flat list of file paths.
 * @returns {object} - A nested object representing the file structure.
 */
export function buildFileTree(fileList) {
    const tree = {}

    for (const filePath of fileList) {
        // Glob always uses forward slashes, which is great for consistency
        const parts = filePath.split('/')
        let currentNode = tree

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i]
            const isLastPart = i === parts.length - 1

            if (isLastPart) {
                // This is a file
                currentNode[part] = null // Use null to mark a file
            } else {
                // This is a directory
                if (!currentNode[part]) {
                    currentNode[part] = {}
                }
                currentNode = currentNode[part]
            }
        }
    }
    return tree
}

/**
 * Recursively generates a plain text string of the file tree structure.
 * This version is for prepending to the LLM context.
 * @param {object} node - The current node (directory) in the tree.
 * @param {string} prefix - The string prefix (connectors) to prepend.
 * @param {string} treeString - The accumulator string.
 *KA @returns {string} - The updated accumulator string.
 */
export function formatFileTreeForContext(node, prefix = '', treeString = '') {
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

        treeString += `${prefix}${connector} ${entry}\n`

        if (childNode !== null) {
            // It's a directory, recurse
            treeString = formatFileTreeForContext(
                childNode,
                prefix + childPrefix,
                treeString
            )
        }
    }
    return treeString
}
