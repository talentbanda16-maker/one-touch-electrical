// Loaded before every test file. dotenv doesn't override variables that
// are already set, so this must win the race against app.js's own
// require("dotenv").config() — Vitest's setupFiles run before any test
// file (and the app.js they import) does.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.test") });
