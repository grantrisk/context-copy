#!/usr/bin/env node
// tells the system to execute this file with Node.js.

import { program } from 'commander'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { main } from './src/main.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageJsonPath = path.resolve(__dirname, 'package.json')
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

program
    .name('context-copy')
    .version(pkg.version)
    .description(
        'A CLI to aggregate and copy project file contents for LLM context.'
    )
    .argument('[project-path]', 'The path to the project directory', '.')
    .option(
        '-i, --ignore-file <path>',
        'Path to a custom ignore file (e.g., .contextignore)',
        '.contextignore'
    )
    .option(
        '-f, --follow-imports',
        'Follow and copy local project imports (only for single files).'
    )
    .option(
        '-d, --deep',
        'Recursively follow imports (requires --follow-imports).'
    )
    .option(
        '-p, --prepend-tree',
        'Include the text-based file tree at the very top of the copied context.'
    )
    .option(
        '-o, --output <path>',
        'Save the context to a file instead of the clipboard.'
    )
    .option(
        '--only <pattern>',
        'Only include files matching the glob pattern (can be used multiple times)',
        (value, previous) => previous.concat([value]),
        []
    )
    .action(async (projectPath, options) => {
        // Resolve the full path to ensure consistency
        const fullPath = path.resolve(projectPath)
        await main(fullPath, options)
    })

program.parse(process.argv)
