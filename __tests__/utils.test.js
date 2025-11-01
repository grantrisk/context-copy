import {
    buildFileTree,
    formatFileTreeForContext,
    countTokens,
} from '../src/lib/utils.js'
import { get_encoding } from 'tiktoken'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('tiktoken', () => {
    return {
        get_encoding: vi.fn(),
    }
})

const mockEncoding = {
    encode: vi.fn(),
    free: vi.fn(),
}

describe('utils.js', () => {
    beforeEach(() => {
        // Reset mocks before each test
        get_encoding.mockClear()
        mockEncoding.encode.mockClear()
        mockEncoding.free.mockClear()
        get_encoding.mockReturnValue(mockEncoding)
    })

    describe('buildFileTree', () => {
        it('should build a nested tree from a flat list', () => {
            const fileList = ['package.json', 'src/main.js', 'src/lib/utils.js']
            const expectedTree = {
                'package.json': null,
                src: {
                    'main.js': null,
                    lib: {
                        'utils.js': null,
                    },
                },
            }
            expect(buildFileTree(fileList)).toEqual(expectedTree)
        })

        it('should handle an empty list', () => {
            expect(buildFileTree([])).toEqual({})
        })
    })

    describe('formatFileTreeForContext', () => {
        it('should format a tree object into a string', () => {
            const tree = {
                'package.json': null,
                src: {
                    lib: {
                        'utils.js': null,
                    },
                    'main.js': null,
                },
            }
            // Note: 'src' (dir) comes before 'package.json' (file) due to sorting
            const expectedString =
                '├─ src\n' +
                '│ ├─ lib\n' +
                '│ │ └─ utils.js\n' +
                '│ └─ main.js\n' +
                '└─ package.json\n'

            expect(formatFileTreeForContext(tree)).toBe(expectedString)
        })
    })

    describe('countTokens', () => {
        it('should return token count on success', () => {
            mockEncoding.encode.mockReturnValue([1, 2, 3]) // Mock 3 tokens
            const count = countTokens('hello world')
            expect(count).toBe(3)
            expect(get_encoding).toHaveBeenCalledWith('cl100k_base')
            expect(mockEncoding.encode).toHaveBeenCalledWith('hello world')
            expect(mockEncoding.free).toHaveBeenCalled()
        })

        it('should fallback to character estimation on tiktoken failure', () => {
            const error = new Error('Failed to load')
            get_encoding.mockImplementation(() => {
                throw error
            })
            // Mock console.warn to suppress output during test
            vi.spyOn(console, 'warn').mockImplementation(() => {})

            const text = 'hello world' // 11 chars
            const count = countTokens(text)
            // Fallback is Math.floor(11 / 4) = 2
            expect(count).toBe(2)
            expect(console.warn).toHaveBeenCalled()
        })
    })
})
