/* eslint-env node */

const defaultConfig = {
  // Global options:
  sourceDir: "./src/",
  artifactsDir: "./dist/",
  ignoreFiles: [".DS_Store", "./tests", ],
  // Command options:
  build: {
    overwriteDest: true,
  },
  run: {
    firefox: "nightly",
    startUrl: ["about:debugging", "https://check.torproject.org/",],
  },
};

module.exports = defaultConfig;
