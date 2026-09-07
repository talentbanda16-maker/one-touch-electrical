const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    // The backend is a CommonJS package ("type": "commonjs") and Vitest
    // 4 is ESM-only, so `require("vitest")` in a test file fails outright
    // — globals mode makes describe/it/expect ambient instead, sidestepping
    // the require()/import mismatch entirely.
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setupEnv.js"],
    globalSetup: ["./tests/globalSetup.js"],
    // Integration tests share one real Postgres test database — running
    // files sequentially avoids races between them (two files truncating
    // or asserting on row counts at the same time), at the cost of some
    // speed. Fine for a suite that runs before a deploy, not on every save.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
