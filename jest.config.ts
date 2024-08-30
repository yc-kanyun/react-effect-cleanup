import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",

  testMatch: ["**/*.(spec|test).(tsx|ts)"],

  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: {
          ignoreCodes: ["TS151001"],
        },
        tsconfig: "tsconfig.app.json",
      },
    ],
  },
};

export default config;
