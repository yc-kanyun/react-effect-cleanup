import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import removeConsole from 'vite-plugin-remove-console'
// import Path from 'path'

export default defineConfig({
    root: '.',
    plugins: [
        removeConsole(),
        dts({
            insertTypesEntry: true,
            include: ['src'],
            exclude: ['src/__tests__']
        }),
    ],
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'abortController',
            fileName: 'index',
        },
        minify: true,
    },
})
