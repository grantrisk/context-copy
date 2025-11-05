import { vi, describe, it, expect, beforeEach } from 'vitest'
import { processDirectory, processSingleFile } from '../src/lib/processor.js'
import { glob } from 'glob'
import fs from 'fs/promises'

// Mock dependencies
vi.mock('glob', () => ({
    glob: vi.fn(),
}))
vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}))

// Cast mocks for type-safety/autocompletion in tests
const mockedGlob = vi.mocked(glob)
const mockedFsReadFile = vi.mocked(fs.readFile)

describe('processor.js', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    describe('processDirectory', () => {
        it('should scan all files by default when no --only patterns are provided', async () => {
            mockedGlob.mockResolvedValue(['src/main.js', 'src/utils.js'])
            mockedFsReadFile.mockImplementation(async (filePath) => {
                if (filePath.endsWith('main.js')) return 'console.log("main")'
                if (filePath.endsWith('utils.js')) return 'export const x = 1'
                return ''
            })

            const result = await processDirectory('/fake/project', [], {})

            // Check that glob was called with the default 'everything' pattern
            expect(mockedGlob).toHaveBeenCalledWith(['**/*'], {
                cwd: '/fake/project',
                dot: true,
                nodir: true,
                ignore: [],
            })

            // Check content
            expect(result.fileCount).toBe(2)
            expect(result.fileList).toEqual(['src/main.js', 'src/utils.js'])
            expect(result.content).toContain('=== File: src/main.js ===')
            expect(result.content).toContain('console.log("main")')
            expect(result.content).toContain('=== File: src/utils.js ===')
            expect(result.content).toContain('export const x = 1')
        })

        it('should only scan files matching --only patterns when provided', async () => {
            // Simulate glob returning only the files that match the --only pattern
            mockedGlob.mockResolvedValue(['src/main.js'])
            mockedFsReadFile
                .mockResolvedValueOnce('console.log("main")')
                .mockResolvedValueOnce('export const x = 1') // This shouldn't be called

            const options = { includePatterns: ['src/main.js'] }
            const result = await processDirectory('/fake/project', [], options)

            // CRITICAL: Check that glob was called with the --only pattern
            expect(mockedGlob).toHaveBeenCalledWith(['src/main.js'], {
                cwd: '/fake/project',
                dot: true,
                nodir: true,
                ignore: [],
            })

            // Check content
            expect(result.fileCount).toBe(1)
            expect(result.fileList).toEqual(['src/main.js'])
            expect(result.content).toContain('=== File: src/main.js ===')
            expect(result.content).toContain('console.log("main")')
            expect(result.content).not.toContain('=== File: src/utils.js ===')
        })

        it('should still respect ignorePatterns when using --only', async () => {
            // Even if --only is broad, the ignore pattern should be passed to glob
            mockedGlob.mockResolvedValue(['src/main.js'])
            mockedFsReadFile.mockResolvedValue('console.log("main")')

            const options = { includePatterns: ['src/**/*.js'] }
            const ignorePatterns = ['src/utils.js']

            await processDirectory('/fake/project', ignorePatterns, options)

            // CRITICAL: Check that glob was called with both the --only pattern
            // and the ignore pattern
            expect(mockedGlob).toHaveBeenCalledWith(['src/**/*.js'], {
                cwd: '/fake/project',
                dot: true,
                nodir: true,
                ignore: ['src/utils.js'], // This is the key assertion
            })
        })

        it('should skip unreadable files and warn', async () => {
            mockedGlob.mockResolvedValue(['src/main.js', 'src/unreadable.js'])
            mockedFsReadFile.mockImplementation(async (filePath) => {
                if (filePath.endsWith('main.js')) return 'console.log("main")'
                if (filePath.endsWith('unreadable.js')) {
                    throw new Error('Permission denied')
                }
                return ''
            })

            // Mock console.warn to check if it's called
            const consoleWarnSpy = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})

            const result = await processDirectory('/fake/project', [], {})

            expect(result.fileCount).toBe(1)
            expect(result.fileList).toEqual(['src/main.js'])
            expect(result.content).toContain('=== File: src/main.js ===')
            expect(result.content).not.toContain('unreadable.js')
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Skipping unreadable file: src/unreadable.js'
                )
            )

            consoleWarnSpy.mockRestore()
        })
    })

    describe('processSingleFile', () => {
        it('should correctly read and format a single file', async () => {
            mockedFsReadFile.mockResolvedValue('// single file content')

            const result = await processSingleFile(
                '/fake/project/src/main.js',
                '/fake/project'
            )

            expect(mockedFsReadFile).toHaveBeenCalledWith(
                '/fake/project/src/main.js',
                'utf-8'
            )
            expect(result.fileCount).toBe(1)
            expect(result.fileList).toEqual(['src/main.js']) // relative path
            expect(result.content).toBe(
                '=== File: src/main.js ===\n\n// single file content\n\n'
            )
        })
    })
})
