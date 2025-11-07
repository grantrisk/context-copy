import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { glob } from 'glob'
import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import ignore from 'ignore'
import { loadAliasConfig } from './config.js'

const SUPPORTED_EXTENSIONS = [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
]
const EXT_REGEX = new RegExp(
    `(${SUPPORTED_EXTENSIONS.join('|').replace(/\./g, '\\.')})$`
)

/**
 * Scans the project and builds a map for resolving module paths.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @param {object} options - The CLI options.
 * @param {function} debug - The optional debug logging function. <--- ADDED
 * @returns {Promise<Map<string, string>>}
 */
async function buildFileMap(
    projectRoot,
    ignorePatterns,
    options = {},
    debug = () => {}
) {
    debug(chalk.gray('Building project file map...'))
    const fileMap = new Map()
    const patterns =
        options.includePatterns && options.includePatterns.length > 0
            ? options.includePatterns
            : ['**/*']

    debug(chalk.gray(`Using glob patterns: ${patterns.join(', ')}`))

    const allFiles = await glob(patterns, {
        cwd: projectRoot,
        dot: true,
        nodir: true,
        ignore: ignorePatterns,
    })

    debug(chalk.gray(`Found ${allFiles.length} files matching glob patterns.`))

    for (const file of allFiles) {
        // Use forward slashes for consistency, as glob does
        const relativePath = file.replace(/\\/g, '/')
        const fileExt = path.extname(relativePath)

        if (SUPPORTED_EXTENSIONS.includes(fileExt)) {
            const relativePathNoExt = relativePath.replace(EXT_REGEX, '')
            debug(
                chalk.gray(
                    `  [MAP] Processing: ${relativePath} -> ${relativePathNoExt}`
                )
            )

            // Add the path without extension: 'src/components/button' -> 'src/components/button.tsx'
            if (!fileMap.has(relativePathNoExt)) {
                fileMap.set(relativePathNoExt, relativePath)
            } else {
                debug(
                    chalk.yellow(
                        `  [WARN] Path already mapped (no ext): ${relativePathNoExt}`
                    )
                )
            }

            // Check if it's an index file: 'src/components/index.tsx'
            const baseName = path.basename(relativePathNoExt)
            if (baseName === 'index') {
                const dirPath = path.dirname(relativePathNoExt) // 'src/components'
                // Add the directory path: 'src/components' -> 'src/components/index.tsx'
                if (dirPath !== '.' && !fileMap.has(dirPath)) {
                    fileMap.set(dirPath, relativePath)
                    debug(
                        chalk.gray(
                            `  [MAP] Added index mapping: ${dirPath} -> ${relativePath}`
                        )
                    )
                }
            }
        } else {
            debug(chalk.gray(`  [SKIP] Unsupported extension: ${relativePath}`))
        }
    }
    debug(chalk.gray(`File map built with ${fileMap.size} entries.`))
    return fileMap
}

/**
 * Parses file content and returns a list of import paths.
 * @param {string} fileContent - The source code of the file.
 * @param {function} debug - The optional debug logging function. <--- ADDED
 * @returns {string[]} - An array of import declaration strings.
 */
export function parseImports(fileContent, debug = () => {}) {
    debug(chalk.gray('Starting AST parsing for imports...'))
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
                    debug(
                        chalk.gray(
                            `  [IMPORT] Found declaration: ${path.node.source.value}`
                        )
                    )
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
                        debug(
                            chalk.gray(
                                `  [IMPORT] Found dynamic: ${path.node.arguments[0].value}`
                            )
                        )
                    }
                }
            },
        })
    } catch (e) {
        console.warn(
            chalk.yellow(`\nWarning: Failed to parse imports: ${e.message}`)
        )
        debug(chalk.red(`AST Parsing Error Details: ${e.stack}`))
    }
    debug(chalk.gray(`Finished parsing. Total imports found: ${imports.size}`))
    return [...imports]
}

/**
 * Processes a single file and all its local imports using a pre-built file map.
 * @param {string} startFilePath - The absolute path to the starting file.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {object} options - The CLI options.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @param {function} debug - The optional debug logging function. <--- ADDED
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
export async function processFileWithImports(
    startFilePath,
    projectRoot,
    options,
    ignorePatterns,
    debug = () => {}
) {
    debug(chalk.bold.magenta('--- Starting Import Processing Traversal ---'))
    debug(chalk.gray(`Start file: ${startFilePath}`))

    const processedFiles = new Set()
    let concatenatedContent = ''
    const fileList = []

    // 1. Build the file map ONCE.
    const fileMap = await buildFileMap(
        projectRoot,
        ignorePatterns,
        options,
        debug
    )

    // 2. Load the alias config ONCE.
    const aliasConfig = loadAliasConfig(projectRoot, debug)

    // Sort aliases from longest to shortest
    const sortedAliasKeys = aliasConfig
        ? Object.keys(aliasConfig.paths).sort((a, b) => b.length - a.length)
        : []

    debug(chalk.gray(`Alias keys loaded and sorted: ${sortedAliasKeys.length}`))

    const ig = ignore().add(ignorePatterns)
    const startPathAbsolute = path.resolve(startFilePath)
    const queue = [{ filePath: startPathAbsolute, level: 0 }]
    const maxLevel = options.deep ? Infinity : 1

    debug(
        chalk.gray(
            `Max traversal level set to: ${maxLevel === Infinity ? 'Infinite' : maxLevel}`
        )
    )

    while (queue.length > 0) {
        const { filePath, level } = queue.shift()
        const relativeToRoot = path
            .relative(projectRoot, filePath)
            .replace(/\\/g, '/')

        debug(
            chalk.yellow(
                `\n--- Processing file at depth ${level}: ${relativeToRoot} ---`
            )
        )

        // 1. Skip if already processed or ignored
        if (processedFiles.has(filePath)) {
            debug(chalk.gray(`[SKIP] Already processed: ${relativeToRoot}`))
            continue
        }
        if (ig.ignores(relativeToRoot)) {
            debug(chalk.yellow(`[SKIP] Ignored by pattern: ${relativeToRoot}`))
            continue
        }
        processedFiles.add(filePath)

        // 2. Read file
        let fileContent
        try {
            fileContent = await fs.readFile(filePath, 'utf-8')
            debug(chalk.green(`[READ] Read file content successfully.`))
        } catch (e) {
            console.warn(
                chalk.yellow(`Skipping unreadable import: ${relativeToRoot}`)
            )
            debug(chalk.red(`[ERROR] File read failed: ${e.message}`))
            continue
        }

        // 3. Add to content
        fileList.push(relativeToRoot)
        concatenatedContent += `=== File: ${relativeToRoot} ===\n\n`
        concatenatedContent += fileContent
        concatenatedContent += '\n\n'
        debug(chalk.cyan(`[APPEND] Appended content to final output.`))

        // 4. Stop if max depth reached
        if (level >= maxLevel) {
            debug(chalk.yellow(`[STOP] Max depth (${maxLevel}) reached.`))
            continue
        }

        // 5. Find, resolve, and add imports to queue
        const imports = parseImports(fileContent, debug)
        const fileDirRelative = path.dirname(relativeToRoot)

        debug(chalk.magenta(`Parsing imports for: ${relativeToRoot}`))

        for (const importPath of imports) {
            let resolvedRelativePath = null
            let resolvedModulePath = null
            let resolutionType = 'Package'

            if (importPath.startsWith('.')) {
                // --- HANDLE RELATIVE IMPORTS ---
                resolvedModulePath = path.join(fileDirRelative, importPath)
                resolutionType = 'Relative'
            } else if (aliasConfig) {
                // --- HANDLE ALIAS IMPORTS ---
                let isAliased = false
                for (const alias of sortedAliasKeys) {
                    if (importPath.startsWith(alias)) {
                        const aliasPath = aliasConfig.paths[alias]
                        const restOfPath = importPath.substring(alias.length)
                        resolvedModulePath = path.join(aliasPath, restOfPath)
                        isAliased = true
                        resolutionType = 'Alias'
                        break
                    }
                }
                if (!isAliased) {
                    debug(
                        chalk.gray(
                            `  [Package]  Skipping external module: '${importPath}'`
                        )
                    )
                    continue
                }
            } else {
                // --- NO ALIASES, MUST BE PACKAGE ---
                debug(
                    chalk.gray(
                        `  [Package]  Skipping external module: '${importPath}'`
                    )
                )
                continue
            }

            resolvedModulePath = path
                .normalize(resolvedModulePath)
                .replace(/\\/g, '/')

            // --- NORMALIZE FOR LOOKUP ---
            // The fileMap keys are extensionless. We must strip the extension
            // from the resolved path to match the map's key format.
            const modulePathForLookup = resolvedModulePath.replace(
                EXT_REGEX,
                ''
            )

            // --- LOOKUP IN FILE MAP ---
            resolvedRelativePath = fileMap.get(modulePathForLookup)

            if (resolvedRelativePath) {
                debug(
                    chalk.gray(
                        `  [${resolutionType}] Resolved '${importPath}' -> '${resolvedRelativePath}'`
                    )
                )

                const finalAbsolutePath = path.join(
                    projectRoot,
                    resolvedRelativePath
                )

                if (ig.ignores(resolvedRelativePath)) {
                    debug(
                        chalk.yellow(
                            `  [Ignore]   Skipping ignored file: ${resolvedRelativePath}`
                        )
                    )
                } else if (processedFiles.has(finalAbsolutePath)) {
                    debug(
                        chalk.gray(
                            `  [Done]     Already processed: ${resolvedRelativePath}`
                        )
                    )
                } else {
                    debug(
                        chalk.cyan(
                            `  [Queue]    Adding to queue: ${resolvedRelativePath}`
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
                debug(
                    chalk.red(
                        `  [Resolve] File not found in map for key: ${modulePathForLookup}`
                    )
                )
            }
        }
    }

    debug(
        chalk.bold.magenta(
            `--- Finished Traversal. Files included: ${fileList.length} ---`
        )
    )

    return {
        content: concatenatedContent,
        fileCount: fileList.length,
        fileList: fileList,
    }
}
