import fs from 'fs/promises'
import path from 'path'
import clipboard from 'clipboardy'
import chalk from 'chalk'
import { glob } from 'glob'
import { get_encoding } from 'tiktoken'
import { parse } from '@babel/parser'
import { createMatchPath, loadConfig } from 'tsconfig-paths'
import ignore from 'ignore'

// --- Default Ignore Patterns ---
const DEFAULT_IGNORE_PATTERNS = [
    // --- Configuration/Meta ---
    '**/.env*',
    '**/*.log',
    '**/*.swp', // Vim swap files
    '**/*.bak', // Backup files
    '**/*~', // Editor temporary files
    '**/.DS_Store',
    '**/thumbs.db', // Windows cache
    '**/Desktop.ini', // Windows metadata
    '**/*.iml', // IntelliJ IDEA module files
    // --- Dependency/Lock Files ---

    '**/yarn.lock',
    '**/package-lock.json',
    '**/Pipfile.lock', // Python lock file
    '**/go.sum', // Go lock file
    // --- Critical Build/Dependency Directories ---

    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.idea/**',
    '**/coverage/**', // Test reports
    '**/tmp/**', // Temporary files
    '**/temp/**', // Temporary files
    '**/log/**', // Log directory
    '**/out/**', // Common output
    '**/target/**', // Rust/Java build output
    '**/vendor/**', // Third-party dependencies
    // --- Compiled/Generated Files/Code ---

    '**/*.min.js', // Minified JavaScript
    '**/*.pyc',
    '**/__pycache__/**', // Python cache directory
    '**/*.class', // Java compiled
    '**/*.jar', // Java archives
    '**/*.o', // Compiled objects
    '**/*.swo', // --- Binary and Archive Files (Existing) ---

    '**/*.png',
    '**/*.jpg',
    '**/*.jpeg',
    '**/*.gif',
    '**/*.ico',
    '**/*.svg',
    '**/*.webp',
    '**/*.pdf',
    '**/*.doc',
    '**/*.docx',
    '**/*.xls',
    '**/*.xlsx',
    '**/*.ppt',
    '**/*.pptx',
    '**/*.zip',
    '**/*.tar',
    '**/*.gz',
    '**/*.rar',
    '**/*.mp3',
    '**/*.mp4',
    '**/*.mov',
    '**/*.avi',
]

// --- Context Size Thresholds ---
const CONTEXT_SIZE_THRESHOLDS = {
    low: 4000, // Safe for most models - Green
    medium: 16000, // Fits in moderate context models - Yellow
    high: 100000, // Fits in large context models - Orange
    // Over 100k tokens will be Red
}

/**
 * Gets the appropriate chalk color based on the token count.
 * @param {number} tokenCount - The total number of tokens.
 * @returns {chalk.Chalk} - A chalk color function.
 */
function getContextSizeColor(tokenCount) {
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
function countTokens(text) {
    // "cl100k_base" is the encoding for gpt-4, gpt-3.5-turbo, and text-embedding-ada-002.
    try {
        const encoding = get_encoding('cl100k_base')
        const tokens = encoding.encode(text)
        encoding.free() // Important to free memory
        return tokens.length
    } catch (error) {
        console.warn(
            chalk.yellow(
                "\nWarning: 'tiktoken' failed. Falling back to character-based token estimation."
            )
        )
        // A common fallback is to assume ~4 characters per token.
        return Math.floor(text.length / 4)
    }
}

/**
 * Loads ignore patterns from default, .gitignore, and custom ignore files.
 * @param {string} rootPath - The root directory of the project.
 * @param {string} customIgnoreFileName - The name of the custom ignore file.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ignore patterns.
 */
async function loadIgnorePatterns(rootPath, customIgnoreFileName) {
    const allPatterns = new Set(DEFAULT_IGNORE_PATTERNS)
    // Helper to read and parse an ignore file
    const parseIgnoreFile = async (filePath) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8')
            content
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))
                .forEach((pattern) => allPatterns.add(pattern))
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(
                    chalk.yellow(
                        `Warning: Could not read ignore file at ${filePath}.`
                    )
                )
            }
        }
    }
    // 1. Read .gitignore
    await parseIgnoreFile(path.resolve(rootPath, '.gitignore'))
    // 2. Read custom ignore file (e.g., .contextignore)
    await parseIgnoreFile(path.resolve(rootPath, customIgnoreFileName))

    return [...allPatterns]
}

/**
 * Builds a nested object (tree) from a flat list of file paths.
 * @param {string[]} fileList - A flat list of file paths.
 * @returns {object} - A nested object representing the file structure.
 */
function buildFileTree(fileList) {
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
        const childPrefix = isLastEntry ? '  ' : '│ '

        console.log(chalk.gray(prefix + connector) + ` ${entry}`)

        if (childNode !== null) {
            // It's a directory, recurse
            printFileTree(childNode, prefix + childPrefix)
        }
    }
}

/**
 * Recursively generates a plain text string of the file tree structure.
 * This version is for prepending to the LLM context.
 * @param {object} node - The current node (directory) in the tree.
 * @param {string} prefix - The string prefix (connectors) to prepend.
 * @param {string} treeString - The accumulator string.
 * @returns {string} - The updated accumulator string.
 */
function formatFileTreeForContext(node, prefix = '', treeString = '') {
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
        const childPrefix = isLastEntry ? '  ' : '│ '

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

/**
 * Processes a directory, reads non-ignored files, and concatenates their content.
 * @param {string} dirPath - The directory to scan.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
async function processDirectory(dirPath, ignorePatterns) {
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
async function processSingleFile(filePath, projectRoot) {
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

/**
 * Finds the project root by searching upwards for a package.json file.
 * @param {string} startPath - The file or directory to start searching from.
 * @returns {Promise<string>} - The absolute path to the project root.
 */
async function findProjectRoot(startPath) {
    let currentPath = (await fs.stat(startPath)).isFile()
        ? path.dirname(startPath)
        : startPath

    while (currentPath) {
        const packageJsonPath = path.join(currentPath, 'package.json')
        try {
            await fs.stat(packageJsonPath)
            return currentPath // Found it
        } catch (e) {
            // Not found, go up
            const parentPath = path.dirname(currentPath)
            if (parentPath === currentPath) {
                // Reached root of filesystem
                break
            }
            currentPath = parentPath
        }
    } // Fallback: if no package.json, return the directory we started from
    return (await fs.stat(startPath)).isFile()
        ? path.dirname(startPath)
        : startPath
}

/**
 * Loads tsconfig/jsconfig and returns the raw alias configuration.
 * @param {string} rootPath - The project root directory.
 * @returns {{paths: Record<string, string[]>} | null} - The alias config or null.
 */
function loadAliasConfig(rootPath) {
    const configLoaderResult = loadConfig(rootPath)

    if (configLoaderResult.resultType === 'failed') {
        console.warn(
            chalk.yellow(
                `\nWarning: Could not load tsconfig/jsconfig from ${rootPath}. Alias resolution will be disabled.`
            )
        )
        console.warn(chalk.yellow(`  Reason: ${configLoaderResult.message}`))
        return null
    }

    const { paths } = configLoaderResult

    if (!paths || Object.keys(paths).length === 0) {
        console.warn(
            chalk.yellow(
                `\nWarning: Loaded ${configLoaderResult.configFileAbsolutePath}, but no "paths" were found. Alias resolution will not work.`
            )
        )
        return null
    }

    console.log(
        chalk.gray(
            `Loaded path configuration from: ${configLoaderResult.configFileAbsolutePath}`
        )
    )

    // Clean the paths: remove trailing "/*"
    const cleanedPaths = {}
    for (const [alias, aliasPaths] of Object.entries(paths)) {
        // We only take the first path mapping, which is standard.
        cleanedPaths[alias.replace(/\/\*$/, '')] = aliasPaths.map((p) =>
            p.replace(/\/\*$/, '')
        )[0]
    }

    return { paths: cleanedPaths }
}

/**
 * Scans the project and builds a map for resolving module paths.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<Map<string, string>>}
 * A map where:
 * Key: A "module path" (e.g., 'src/components/ui/button', 'src/components/ui')
 * Value: The *actual* relative file path (e.g., 'src/components/ui/button.tsx', 'src/components/ui/index.tsx')
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
function parseImports(fileContent) {
    const imports = new Set()
    try {
        const ast = parse(fileContent, {
            sourceType: 'module',
            plugins: ['jsx', 'typescript', 'decorators-legacy'], // Enable common syntax
        })

        ast.program.body.forEach((node) => {
            if (node.type === 'ImportDeclaration' && node.source) {
                imports.add(node.source.value)
            } // Also catch dynamic imports: import()
            if (
                node.type === 'ExpressionStatement' &&
                node.expression.type === 'CallExpression' &&
                node.expression.callee.type === 'Import'
            ) {
                if (
                    node.expression.arguments[0] &&
                    node.expression.arguments[0].type === 'StringLiteral'
                ) {
                    imports.add(node.expression.arguments[0].value)
                }
            }
        })
    } catch (e) {
        console.warn(
            chalk.yellow(`\nWarning: Failed to parse imports: ${e.message}`)
        )
    }
    return [...imports]
}

/**
 * Tries to resolve an import path to an actual file, checking extensions.
 * @param {string} basePath - The import path (already resolved for aliases/relativity).
 * @returns {Promise<string | null>} - The full path to the file, or null.
 */
async function resolveImportPath(basePath) {
    const extensions = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json'] // 1. Try as-is
    try {
        if ((await fs.stat(basePath)).isFile()) return basePath
    } catch (e) {} // 2. Try with extensions

    for (const ext of extensions) {
        try {
            const fullPath = basePath + ext
            if ((await fs.stat(fullPath)).isFile()) return fullPath
        } catch (e) {}
    } // 3. Try as a directory (index.js, etc.)

    for (const ext of extensions) {
        try {
            const fullPath = path.join(basePath, 'index' + ext)
            if ((await fs.stat(fullPath)).isFile()) return fullPath
        } catch (e) {}
    }
    return null // Not found
}

/**
 * Processes a single file and all its local imports using a pre-built file map.
 * @param {string} startFilePath - The absolute path to the starting file.
 * @param {string} projectRoot - The absolute path to the project root.
 * @param {object} options - The CLI options.
 * @param {string[]} ignorePatterns - An array of glob patterns to ignore.
 * @returns {Promise<{content: string, fileCount: number, fileList: string[]}>}
 */
async function processFileWithImports(
    startFilePath,
    projectRoot,
    options,
    ignorePatterns
) {
    const processedFiles = new Set()
    let concatenatedContent = ''
    const fileList = []

    // --- NEW STRATEGY ---
    // 1. Build the file map ONCE.
    const fileMap = await buildFileMap(projectRoot, ignorePatterns)
    // 2. Load the alias config ONCE.
    const aliasConfig = loadAliasConfig(projectRoot)
    // Sort aliases from longest to shortest to handle '@/' and '@/components' correctly
    const sortedAliasKeys = aliasConfig
        ? Object.keys(aliasConfig.paths).sort((a, b) => b.length - a.length)
        : []
    // --- END NEW STRATEGY ---

    const ig = ignore().add(ignorePatterns)
    const queue = [{ filePath: path.resolve(startFilePath), level: 0 }]
    const maxLevel = options.deep ? Infinity : 1

    while (queue.length > 0) {
        const { filePath, level } = queue.shift()

        // Use relative path for all internal logic (ignoring, file map, etc.)
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
        const fileDirRelative = path.dirname(relativeToRoot) // e.g., 'src/components/header'

        console.log(chalk.magenta(`\nParsing imports for: ${relativeToRoot}`))

        for (const importPath of imports) {
            let resolvedRelativePath = null
            let resolvedModulePath = null // The path *before* looking in the map

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

            // Normalize the path (e.g., 'src/components/../context' -> 'src/context')
            resolvedModulePath = path
                .normalize(resolvedModulePath)
                .replace(/\\/g, '/')

            // --- LOOKUP IN FILE MAP ---
            resolvedRelativePath = fileMap.get(resolvedModulePath)

            if (resolvedRelativePath) {
                const type = importPath.startsWith('.') ? 'Relative' : 'Alias'
                console.log(
                    chalk.gray(
                        `  [${type}]   '${importPath}' -> '${resolvedRelativePath}'`
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
                // We resolved a path, but it's not in our file map
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

/**
 * Displays the final summary report to the console.
 * @param {string} content - The concatenated content.
 * @param {number} fileCount - The number of files processed.
 * @param {string[]} fileList - The list of processed files.
 */
function displaySummary(content, fileCount, fileList) {
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
        color(`    Total Tokens (est.): ${tokenCount.toLocaleString()}`)
    )
    console.log(color(`    Total Lines: ${lineCount.toLocaleString()}`))
    console.log(color(`    Total Chars: ${charCount.toLocaleString()}`))
    console.log(color(`    Total Size: ${contentSizeKB} KB`))

    if (color === chalk.red || color === chalk.hex('#FFA500')) {
        console.log(
            color.bold(
                'Warning: Context size is very large. This may exceed model limits.'
            )
        )
    }
}

/**
 * The main function that orchestrates the entire process.
 * @param {string} targetPath - The full path to the project directory or file.
 * @param {object} options - The CLI options from commander.
 */
export async function main(targetPath, options) {
    try {
        const stats = await fs.stat(targetPath)
        let result
        let projectRoot // 1. Find project root first for context (aliases, ignores)

        if (stats.isDirectory()) {
            projectRoot = targetPath
        } else {
            projectRoot = await findProjectRoot(targetPath)
        }
        console.log(chalk.blue(`🚀 Scanning path: ${targetPath}`))
        if (projectRoot !== targetPath) {
            console.log(chalk.blue(`Found project root: ${projectRoot}`))
        } // 2. Load ignore patterns relative to the root
        const ignorePatterns = await loadIgnorePatterns(
            projectRoot,
            options.ignoreFile
        ) // 3. Decide processing strategy

        if (stats.isDirectory()) {
            result = await processDirectory(projectRoot, ignorePatterns)
        } else if (stats.isFile()) {
            if (options.followImports) {
                console.log(
                    chalk.blue(
                        `Following imports (${options.deep ? 'deep' : 'shallow'})...`
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

        let { content, fileCount, fileList } = result

        if (fileCount === 0) {
            console.log(chalk.yellow('No files were read. Nothing to copy.'))
            return
        }

        if (options.prependTree) {
            console.log(
                chalk.blue.bold('🌲 Prepending file tree to context...')
            )
            const fileTreeObject = buildFileTree(fileList)
            let treeString = formatFileTreeForContext(fileTreeObject)

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

        await clipboard.write(content)
        displaySummary(content, fileCount, fileList)
    } catch (error) {
        console.error(chalk.red.bold('\n❌ An error occurred:'))
        console.error(chalk.red(error.message))
        process.exit(1)
    }
}
