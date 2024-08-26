import type { Config } from 'jest';

const config: Config = {
    testEnvironment: "jsdom",

    testMatch: ['**/__tests__/**/*.spec.(tsx|ts)'],

    fakeTimers: {
        enableGlobally: true,
    },

    transform: {
        '^.+\\.tsx?$': [
            'ts-jest', {
                diagnostics: {
                    ignoreCodes: ['TS151001'],
                },
                tsconfig: 'tsconfig.app.json'
            }
        ],
    },
};

export default config;
