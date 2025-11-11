// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createDefaultPreset } = require("ts-jest");

const tsJestPreset = createDefaultPreset();

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  globals: {
    "ts-jest": {
      useESM: false,
      tsconfig: {
        allowJs: true,
        module: "commonjs",
      },
    },
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        allowJs: true,
      },
    }],
    "^.+\\.js$": ["ts-jest", {
      tsconfig: {
        allowJs: true,
        module: "commonjs",
      },
    }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(d3-color|@looker)/)",
  ],
};