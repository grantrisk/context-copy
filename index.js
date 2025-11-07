#!/usr/bin/env node
// tells the system to execute this file with Node.js.

import { program } from 'commander'
import path from 'path'
import { VALID_CONFIG_KEYS } from './src/lib/constants.js'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { main } from './src/main.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageJsonPath = path.resolve(__dirname, 'package.json')
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const configCommand = program
    .command('config')
    .description('Manage local configuration settings.')

// `ccopy config list`
configCommand
    .command('list')
    .description('List all saved local configuration settings.')
    .action(async () => {
        const debug = createDebugger(true) // Always show debug for config
        const config = await loadGlobalConfig(debug)
        const configPath = await getGlobalConfigPath(debug)

        console.log(chalk.bold('Current context-copy configuration:'))
        console.log(chalk.dim(`(from ${configPath})\n`))

        if (Object.keys(config).length === 0) {
            console.log(chalk.gray('  (No settings saved. Using defaults.)'))
        } else {
            for (const [key, value] of Object.entries(config)) {
                console.log(`  ${key} = ${chalk.cyan(value)}`)
            }
        }
    })

// `ccopy config set <key> <value>`
configCommand
    .command('set <key> <value>')
    .description('Save a default setting (e.g., prepend-tree true).')
    .action(async (key, value) => {
        const debug = createDebugger(true)
        if (!VALID_CONFIG_KEYS.includes(key)) {
            console.error(
                chalk.red(`Error: '${key}' is not a valid configuration key.`)
            )
            console.log(
                chalk.gray(`Valid keys are: ${VALID_CONFIG_KEYS.join(', ')}`)
            )
            process.exit(1)
        }

        // Coerce boolean strings
        let finalValue = value
        if (value.toLowerCase() === 'true') finalValue = true
        if (value.toLowerCase() === 'false') finalValue = false

        const config = await loadGlobalConfig(debug)
        config[key] = finalValue
        await saveGlobalConfig(config, debug)

        console.log(chalk.green(`Success! Set default ${key} = ${finalValue}`))
    })

// `ccopy config get <key>`
configCommand
    .command('get <key>')
    .description('Get the value of a specific setting.')
    .action(async (key) => {
        const debug = createDebugger(true)
        const config = await loadGlobalConfig(debug)
        if (config.hasOwnProperty(key)) {
            console.log(config[key])
        } else {
            console.log(chalk.gray(`'${key}' is not set. Using default.`))
        }
    })

// `ccopy config edit`
configCommand
    .command('edit')
    .description('Open the configuration file in your default editor.')
    .action(async () => {
        const configPath = await getGlobalConfigPath(createDebugger(true))
        const editor =
            process.env.EDITOR ||
            (process.platform === 'win32' ? 'notepad' : 'nano')

        console.log(chalk.gray(`Opening ${configPath} with ${editor}...`))

        // Spawn a detached child process for the editor
        exec(`${editor} "${configPath}"`, (error) => {
            if (error) {
                console.error(
                    chalk.red(`Failed to open editor: ${error.message}`)
                )
            }
        })
    })

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
    .option('-D, --debug', 'Enable debug logging for detailed process tracing.')
    .action(async (projectPath, options) => {
        // Resolve the full path to ensure consistency
        const fullPath = path.resolve(projectPath)
        await main(fullPath, options)
    })

program.parse(process.argv)
