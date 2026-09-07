import { defineConfig, devices } from "@playwright/test";

// Assumes the app's normal dev servers are already running — `npm run
// dev` in both backend/ and frontend/ — same as how this app has been
// manually tested throughout development. Not auto-started here so a
// suite run never fights with (or silently reuses) an already-running
// pair of servers on these same ports.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Serial, single-worker: the suite exercises real logins against the
  // app's own rate limiter (5/min, shared across the whole run) just
  // like production traffic would — parallel workers racing multiple
  // files' logins at once made that limiter trip mid-suite.
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Normally unset — Playwright resolves its own downloaded browser
        // (`npx playwright install`). Only needed in sandboxed/offline
        // environments where that download can't reach the network but a
        // browser binary is already present at a known path.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
});
