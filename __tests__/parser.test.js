import { parseImports } from '../src/lib/parser.js'
import { describe, it, expect, vi } from 'vitest'

describe('parser.js', () => {
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
            // Mock console.warn to suppress output
            vi.spyOn(console, 'warn').mockImplementation(() => {})
            const imports = parseImports(code)
            expect(imports).toEqual([])
            expect(console.warn).toHaveBeenCalled()
        })
    })
})
