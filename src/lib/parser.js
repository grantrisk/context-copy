import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { glob } from 'glob'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import ignore from 'ignore'
import { loadAliasConfig } from './config.js'

/**
 * Scans the project and builds a map for resolving module paths.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<Map<string, string>>}
 */
async function buildFileMap(projectRoot, ignorePatterns) {
    console.log(chalk.gray('Building project file map...'))
    const fileMap = new Map()
    const allFiles = await glob('**/*', {
        cwd: projectRoot,
        dot: true,
        nodir: true,
        ignore: ignorePatterns,
    })

    const extensions = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json']
    const extRegex = new RegExp(
        `(${extensions.join('|').replace(/\./g, '\\.')})$`
    )

    for (const file of allFiles) {
        // Use forward slashes for consistency, as glob does
        const relativePath = file.replace(/\\/g, '/')
        const fileExt = path.extname(relativePath)

        if (extensions.includes(fileExt)) {
            const relativePathNoExt = relativePath.replace(extRegex, '')

            // Add the path without extension: 'src/components/button' -> 'src/components/button.tsx'
            if (!fileMap.has(relativePathNoExt)) {
                fileMap.set(relativePathNoExt, relativePath)
            }

            // Check if it's an index file: 'src/components/index.tsx'
            const baseName = path.basename(relativePathNoExt)
            if (baseName === 'index') {
                const dirPath = path.dirname(relativePathNoExt) // 'src/components'
                // Add the directory path: 'src/components' -> 'src/components/index.tsx'
                if (dirPath !== '.' && !fileMap.has(dirPath)) {
                    fileMap.set(dirPath, relativePath)
                }
            }
        }
    }
    console.log(chalk.gray(`File map built with ${fileMap.size} entries.`))
    return fileMap
}

/**
 * Parses file content and returns a list of import paths.
 * @param {string} fileContent - The source code of the file.
 * @returns {string[]} - An array of import declaration strings.
 */
export function parseImports(fileContent) {
    const imports = new Set()
    try {
        const ast = parse(fileContent, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'], // Enable common syntax
        })

        // Use traverse to visit all nodes, not just the top level
        traverse(ast, {
            // Handles: import fs from 'fs'
            ImportDeclaration(path) {
                if (path.node.source) {
                    imports.add(path.node.source.value)
                }
            },
            // Handles: import('./foo.js') or () => import('./bar.js')
            CallExpression(path) {
                if (path.node.callee.type === 'Import') {
                    if (
                        path.node.arguments[0] &&
                        path.node.arguments[0].type === 'StringLiteral'
                    ) {
                        imports.add(path.node.arguments[0].value)
                    }
                }
            },
        })
    } catch (e) {
        console.warn(
            chalk.yellow(`\nWarning: Failed to parse imports: ${e.message}`)
        )
    }
    return [...imports]
}

/**
 * Processes a single file and all its local imports using a pre-built file map.
 * @param {string} startFilePath - The absolute path to the starting file.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {object} options - The CLI options.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processFileWithImports(
    startFilePath,
    projectRoot,
    options,
    ignorePatterns
) {
    const processedFiles = new Set()
    let concatenatedContent = ''
    const fileList = []

    // 1. Build the file map ONCE.
    const fileMap = await buildFileMap(projectRoot, ignorePatterns)
    // 2. Load the alias config ONCE.
    const aliasConfig = loadAliasConfig(projectRoot)
    // Sort aliases from longest to shortest
    const sortedAliasKeys = aliasConfig
        ? Object.keys(aliasConfig.paths).sort((a, b) => b.length - a.length)
        : []

    const ig = ignore().add(ignorePatterns)
    const queue = [{ filePath: path.resolve(startFilePath), level: 0 }]
    const maxLevel = options.deep ? Infinity : 1

    while (queue.length > 0) {
        const { filePath, level } = queue.shift()
        const relativeToRoot = path
            .relative(projectRoot, filePath)
            .replace(/\\/g, '/')

        // 1. Skip if already processed or ignored
        if (processedFiles.has(filePath) || ig.ignores(relativeToRoot)) {
            continue
        }
        processedFiles.add(filePath)

        // 2. Read file
        let fileContent
        try {
            fileContent = await fs.readFile(filePath, 'utf-8')
        } catch (e) {
            console.warn(
                chalk.yellow(`Skipping unreadable import: ${relativeToRoot}`)
            )
            continue
        }

        // 3. Add to content
        fileList.push(relativeToRoot)
        concatenatedContent += `=== File: ${relativeToRoot} ===\n\n`
        concatenatedContent += fileContent
        concatenatedContent += '\n\n'

        // 4. Stop if max depth reached
        if (level >= maxLevel) {
            continue
        }

        // 5. Find, resolve, and add imports to queue
        const imports = parseImports(fileContent)
        const fileDirRelative = path.dirname(relativeToRoot)

        console.log(chalk.magenta(`\nParsing imports for: ${relativeToRoot}`))

        for (const importPath of imports) {
            let resolvedRelativePath = null
            let resolvedModulePath = null

            if (importPath.startsWith('.')) {
                // --- HANDLE RELATIVE IMPORTS ---
                resolvedModulePath = path.join(fileDirRelative, importPath)
            } else if (aliasConfig) {
                // --- HANDLE ALIAS IMPORTS ---
                let isAliased = false
                for (const alias of sortedAliasKeys) {
                    if (importPath.startsWith(alias)) {
                        const aliasPath = aliasConfig.paths[alias]
                        const restOfPath = importPath.substring(alias.length)
                        resolvedModulePath = path.join(aliasPath, restOfPath)
                        isAliased = true
                        break
                    }
                }
                if (!isAliased) {
                    console.log(
                        chalk.gray(`  [Package]  Skipping '${importPath}'`)
                    )
                    continue
                }
            } else {
                // --- NO ALIASES, MUST BE PACKAGE ---
                console.log(chalk.gray(`  [Package]  Skipping '${importPath}'`))
                continue
            }

            resolvedModulePath = path
                .normalize(resolvedModulePath)
                .replace(/\\/g, '/')

            // --- LOOKUP IN FILE MAP ---
            resolvedRelativePath = fileMap.get(resolvedModulePath)

            if (resolvedRelativePath) {
                const type = importPath.startsWith('.') ? 'Relative' : 'Alias'
                console.log(
                    chalk.gray(
                        `  [${type}]    '${importPath}' -> '${resolvedRelativePath}'`
                    )
                )

                const finalAbsolutePath = path.join(
                    projectRoot,
                    resolvedRelativePath
                )

                if (ig.ignores(resolvedRelativePath)) {
                    console.log(
                        chalk.yellow(
                            `  [Ignore]   Skipping ${resolvedRelativePath}`
                        )
                    )
                } else if (processedFiles.has(finalAbsolutePath)) {
                    console.log(
                        chalk.gray(
                            `  [Done]     Already processed ${resolvedRelativePath}`
                        )
                    )
                } else {
                    console.log(
                        chalk.cyan(
                            `  [Queue]    Adding ${resolvedRelativePath} to queue`
                        )
                    )
                    queue.push({
                        filePath: finalAbsolutePath,
                        level: level + 1,
                    })
                }
            } else if (resolvedModulePath) {
                console.warn(
                    chalk.yellow(
                        `  [Resolve]  Could not find file for: '${importPath}' (Resolved to: ${resolvedModulePath})`
                    )
                )
            }
        }
    }

    return {
        content: concatenatedContent,
        fileCount: fileList.length,
        fileList: fileList,
    }
}
