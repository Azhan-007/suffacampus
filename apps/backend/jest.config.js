/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
  restoreMocks: true,
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/workers/**",
    "!src/lib/firebase-admin.ts",
  ],
  coverageReporters: ["text", "text-summary", "lcov"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  // Prevent actual Firebase SDK from initializing
  moduleNameMapper: {
    "^../lib/firebase-admin(\\.js)?$": "<rootDir>/tests/__mocks__/firebase-admin.ts",
    "^../../lib/firebase-admin(\\.js)?$": "<rootDir>/tests/__mocks__/firebase-admin.ts",
    "^../../../lib/firebase-admin(\\.js)?$": "<rootDir>/tests/__mocks__/firebase-admin.ts",
    "^\\.\\./__mocks__/firebase-admin$": "<rootDir>/tests/__mocks__/firebase-admin.ts",
    "^(\\.\\.?\\/.*)\\.js$": "$1",
  },
};
