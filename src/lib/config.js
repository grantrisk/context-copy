import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { loadConfig } from 'tsconfig-paths'
import { DEFAULT_IGNORE_PATTERNS } from './constants.js'

/**
 * Loads ignore patterns from default, .gitignore, and custom ignore files.
 * @param {string} rootPath - The root directory of the project.
 * @param {string} customIgnoreFileName - The name of the custom ignore file.
 * @param {function} debug - The optional debug logging function.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ignore patterns.
 */
export async function loadIgnorePatterns(
    rootPath,
    customIgnoreFileName,
    debug = () => {}
) {
    debug(chalk.gray('Starting to load ignore patterns...'))
    const allPatterns = new Set(DEFAULT_IGNORE_PATTERNS)

    // Helper to read and parse an ignore file
    const parseIgnoreFile = async (filePath) => {
        const fileName = path.basename(filePath)
        try {
            const content = await fs.readFile(filePath, 'utf-8')
            debug(chalk.gray(`Parsing ignore file: ${fileName}`))
            const newPatterns = content
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))

            newPatterns.forEach((pattern) => allPatterns.add(pattern))
            debug(
                chalk.gray(
                    `Added ${newPatterns.length} patterns from ${fileName}`
                )
            )
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn(
                    chalk.yellow(
                        `Warning: Could not read ignore file at ${filePath}.`
                    )
                )
            } else {
                debug(
                    chalk.gray(`No ignore file found at ${filePath}. Skipping.`)
                )
            }
        }
    }

    // 1. Read .gitignore
    await parseIgnoreFile(path.resolve(rootPath, '.gitignore'))
    // 2. Read custom ignore file (e.g., .contextignore)
    await parseIgnoreFile(path.resolve(rootPath, customIgnoreFileName))

    debug(chalk.gray(`Total ignore patterns loaded: ${allPatterns.size}`))
    return [...allPatterns]
}

/**
 * Finds the project root by searching upwards for a package.json file.
 * @param {string} startPath - The file or directory to start searching from.
 * @returns {Promise<string>} - The absolute path to the project root.
 */
export async function findProjectRoot(startPath, debug = () => {}) {
    debug(chalk.gray(`Starting project root search from: ${startPath}`))

    let currentPath = (await fs.stat(startPath)).isFile()
        ? path.dirname(startPath)
        : startPath

    while (currentPath) {
        const packageJsonPath = path.join(currentPath, 'package.json')
        debug(chalk.gray(`Checking for package.json in: ${currentPath}`))
        try {
            await fs.stat(packageJsonPath)
            debug(chalk.green(`Found project root: ${currentPath}`))
            return currentPath // Found it
        } catch (e) {
            // Not found, go up
            const parentPath = path.dirname(currentPath)
            if (parentPath === currentPath) {
                // Reached root of filesystem
                debug(
                    chalk.yellow(
                        'Reached filesystem root without finding package.json.'
                    )
                )
                break
            }
            currentPath = parentPath
        }
    }

    const fallbackPath = (await fs.stat(startPath)).isFile()
        ? path.dirname(startPath)
        : startPath

    debug(
        chalk.yellow(
            `Falling back to start path directory as project root: ${fallbackPath}`
        )
    )
    return fallbackPath
}

/**
 * Loads TypeScript/JavaScript path aliases from tsconfig.json or jsconfig.json.
 * @param {string} projectRoot - The project root directory.
 * @param {function} debug - The optional debug logging function.
 * @returns {{paths: Object<string, string>} | null}
 */
export function loadAliasConfig(projectRoot, debug = () => {}) {
    const configLoaderResult = loadConfig(projectRoot)

    if (!configLoaderResult || !configLoaderResult.configFileAbsolutePath) {
        debug(chalk.gray('No tsconfig/jsconfig file found for path aliases.'))
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

    debug(
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
