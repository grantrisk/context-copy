import fs from 'fs/promises'
import path from 'path'
import chalk from 'chalk'
import { loadConfig } from 'tsconfig-paths'
import { DEFAULT_IGNORE_PATTERNS } from './constants.js'

/**
 * Loads ignore patterns from default, .gitignore, and custom ignore files.
 * @param {string} rootPath - The root directory of the project.
 * @param {string} customIgnoreFileName - The name of the custom ignore file.
 * @returns {Promise<string[]>} - A promise that resolves to an array of ignore patterns.
 */
export async function loadIgnorePatterns(rootPath, customIgnoreFileName) {
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
 * Finds the project root by searching upwards for a package.json file.
 * @param {string} startPath - The file or directory to start searching from.
 * @returns {Promise<string>} - The absolute path to the project root.
 */
export async function findProjectRoot(startPath) {
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
export function loadAliasConfig(rootPath) {
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
