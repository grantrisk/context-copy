import { loadIgnorePatterns } from '../src/lib/config.js'
import { DEFAULT_IGNORE_PATTERNS } from '../src/lib/constants.js'
import fs from 'fs/promises'
import path from 'path'
import { describe, it, expect, beforeEach, jest } from '@jest/globals'

jest.mock('fs/promises', () => {
    const { jest } = require('@jest/globals') // Use require here
    return {
        readFile: jest.fn(),
    }
})

// Cast the mock for type safety in the test
const mockedFsReadFile = fs.readFile

describe('config.js', () => {
    describe('loadIgnorePatterns', () => {
        beforeEach(() => {
            // Reset the mock before each test
            mockedFsReadFile.mockReset()
            // Mock console.warn to suppress output
            jest.spyOn(console, 'warn').mockImplementation(() => {})
        })

        it('should load defaults, .gitignore, and custom file', async () => {
            // Mock .gitignore
            mockedFsReadFile.mockImplementation((filePath) => {
                if (filePath === path.resolve('/fake/project', '.gitignore')) {
                    return Promise.resolve('*.log\nnode_modules/\n')
                }
                if (filePath === path.resolve('/fake/project', '.my-ignore')) {
                    return Promise.resolve('# A comment\n/dist\n')
                }
                return Promise.reject(new Error('ENOENT'))
            })

            const patterns = await loadIgnorePatterns(
                '/fake/project',
                '.my-ignore'
            )

            // Should contain defaults
            expect(patterns).toEqual(
                expect.arrayContaining(DEFAULT_IGNORE_PATTERNS)
            )
            // Should contain .gitignore rules
            expect(patterns).toContain('*.log')
            expect(patterns).toContain('node_modules/')
            // Should contain custom ignore rules
            expect(patterns).toContain('/dist')
            // Should not contain comments
            expect(patterns).not.toContain('# A comment')
        })

        it('should only return defaults if no ignore files are found', async () => {
            // Mock all reads to fail with "File not found"
            const enoentError = new Error('File not found')
            enoentError.code = 'ENOENT'
            mockedFsReadFile.mockRejectedValue(enoentError)

            const patterns = await loadIgnorePatterns(
                '/fake/project',
                '.contextignore'
            )
            expect(patterns).toEqual(DEFAULT_IGNORE_PATTERNS)
            expect(console.warn).not.toHaveBeenCalled()
        })

        it('should warn on read error (but not ENOENT)', async () => {
            // Mock read to fail with "Permission denied"
            mockedFsReadFile.mockRejectedValue(new Error('EACCES'))

            const patterns = await loadIgnorePatterns(
                '/fake/project',
                '.contextignore'
            )
            // Should still return defaults
            expect(patterns).toEqual(DEFAULT_IGNORE_PATTERNS)
            // Should have warned
            expect(console.warn).toHaveBeenCalled()
        })
    })
})
