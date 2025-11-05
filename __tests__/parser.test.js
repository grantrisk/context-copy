import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseImports, processFileWithImports } from '../src/lib/parser.js'
import { glob } from 'glob'
import fs from 'fs/promises'
import { loadAliasConfig } from '../src/lib/config.js'

// Mock dependencies
vi.mock('glob', () => ({
    glob: vi.fn(),
}))
vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}))
vi.mock('../src/lib/config.js', () => ({
    loadAliasConfig: vi.fn(),
}))

// Cast mocks
const mockedGlob = vi.mocked(glob)
const mockedFsReadFile = vi.mocked(fs.readFile)
const mockedLoadAliasConfig = vi.mocked(loadAliasConfig)

// Define spies here, but set them up in beforeEach
let consoleWarnSpy
let consoleLogSpy

describe('parser.js', () => {
    beforeEach(() => {
        // Set up spies *before* each test
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        // Restore original functions and clear mocks
        consoleWarnSpy.mockRestore()
        consoleLogSpy.mockRestore()
        vi.clearAllMocks()
    })

    describe('parseImports', () => {
        it('should find static import declarations', () => {
            const code = `
                import fs from 'fs';
                import path from "path";
                import './styles.css';
            `
            const imports = parseImports(code)
            expect(imports).toContain('fs')
            expect(imports).toContain('path')
            expect(imports).toContain('./styles.css')
        })

        it('should find dynamic import() expressions', () => {
            const code = `
                const myModule = await import('./myModule.js');
                import('another-module');
            `
            const imports = parseImports(code)
            expect(imports).toContain('./myModule.js')
            expect(imports).toContain('another-module')
        })

        it('should handle mixed imports and ignore non-imports', () => {
            const code = `
                import React from 'react';
                import { Button } from '@/components/Button';

                function test() {
                    console.log('import'); // Not an import
                }

                const lazy = () => import('./LazyComponent');
            `
            const imports = parseImports(code)
            expect(imports).toEqual([
                'react',
                '@/components/Button',
                './LazyComponent',
            ])
        })

        it('should handle syntax errors gracefully', () => {
            const code = "import fs from 'fs' THIS IS A SYNTAX ERROR"

            const imports = parseImports(code)
            expect(imports).toEqual([])
            // It uses the spy set up in the parent beforeEach
            expect(consoleWarnSpy).toHaveBeenCalled()
        })
    })

    describe('processFileWithImports', () => {
        const projectRoot = '/fake/project'
        const startFile = '/fake/project/src/main.js'

        beforeEach(() => {
            // This hook runs *after* the parent beforeEach
            // We just need to set the default mock values
            mockedLoadAliasConfig.mockReturnValue(null) // No aliases by default
        })

        it('should scan all imports by default (no --only)', async () => {
            // 1. Mock file map (glob)
            mockedGlob.mockResolvedValue([
                'src/main.js',
                'src/lib/utils.js',
                'src/lib/ignore.js',
            ])

            // 2. Mock file reads
            mockedFsReadFile.mockImplementation(async (filePath) => {
                if (filePath.endsWith('src/main.js')) {
                    return `
                        import './lib/utils.js';
                        import './lib/ignore.js';
                    `
                }
                if (filePath.endsWith('src/lib/utils.js')) {
                    return 'export const util = 1;'
                }
                if (filePath.endsWith('src/lib/ignore.js')) {
                    return 'export const ignore = 1;'
                }
                return ''
            })

            const options = { deep: true }
            const ignorePatterns = ['src/lib/ignore.js'] // Test ignorePatterns

            const result = await processFileWithImports(
                startFile,
                projectRoot,
                options,
                ignorePatterns
            )

            // Check that glob was called with default pattern
            expect(mockedGlob).toHaveBeenCalledWith(['**/*'], {
                cwd: projectRoot,
                dot: true,
                nodir: true,
                ignore: ignorePatterns,
            })

            // Check final content
            expect(result.fileCount).toBe(2)
            expect(result.fileList).toEqual(['src/main.js', 'src/lib/utils.js'])
            expect(result.content).toContain('=== File: src/main.js ===')
            expect(result.content).toContain("import './lib/utils.js'")
            expect(result.content).toContain('=== File: src/lib/utils.js ===')
            expect(result.content).toContain('export const util = 1;')

            // Should not include the ignored file
            expect(result.content).not.toContain('src/lib/ignore.js')
        })

        it('should restrict file map when --only is used, failing non-included imports', async () => {
            const options = {
                deep: true,
                includePatterns: ['src/main.js'], // Only include main.js
            }

            // 1. Mock file map (glob) - This is the key change
            // Glob is called with --only patterns, so it only finds main.js
            mockedGlob.mockResolvedValue(['src/main.js'])

            // 2. Mock file reads
            mockedFsReadFile.mockImplementation(async (filePath) => {
                if (filePath.endsWith('src/main.js')) {
                    return `import './lib/utils.js';` // Tries to import utils.js
                }
                return ''
            })

            const result = await processFileWithImports(
                startFile,
                projectRoot,
                options,
                []
            )

            // Check that glob was called with the --only pattern
            expect(mockedGlob).toHaveBeenCalledWith(['src/main.js'], {
                cwd: projectRoot,
                dot: true,
                nodir: true,
                ignore: [],
            })

            // Check final content
            expect(result.fileCount).toBe(1)
            expect(result.fileList).toEqual(['src/main.js'])
            expect(result.content).toContain('=== File: src/main.js ===')

            // It should NOT include utils.js because it wasn't in the file map
            expect(result.content).not.toContain('src/lib/utils.js')

            // It should have warned about the failed resolution
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    "Could not find file for: './lib/utils.js'"
                )
            )
        })

        it('should follow imports when all files are included with --only', async () => {
            const options = {
                deep: true,
                includePatterns: ['src/main.js', 'src/lib/utils.js'], // Include both
            }

            // 1. Mock file map (glob) - returns both files
            mockedGlob.mockResolvedValue(['src/main.js', 'src/lib/utils.js'])

            // 2. Mock file reads
            mockedFsReadFile.mockImplementation(async (filePath) => {
                if (filePath.endsWith('src/main.js')) {
                    return `import './lib/utils.js';`
                }
                if (filePath.endsWith('src/lib/utils.js')) {
                    return 'export const util = 1;'
                }
                return ''
            })

            const result = await processFileWithImports(
                startFile,
                projectRoot,
                options,
                []
            )

            // Check that glob was called with the --only patterns
            expect(mockedGlob).toHaveBeenCalledWith(
                ['src/main.js', 'src/lib/utils.js'],
                expect.any(Object)
            )

            // Check final content
            expect(result.fileCount).toBe(2)
            expect(result.fileList).toEqual(['src/main.js', 'src/lib/utils.js'])
            expect(result.content).toContain('=== File: src/main.js ===')
            expect(result.content).toContain('=== File: src/lib/utils.js ===')
            expect(result.content).toContain('export const util = 1;')

            // No warning this time
            expect(consoleWarnSpy).not.toHaveBeenCalled()
        })
    })
})
