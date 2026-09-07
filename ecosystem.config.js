// PM2 process manager config — watches the backend and frontend dev
// servers and restarts either one automatically if it ever crashes.
// Usage:
//   pm2 start ecosystem.config.js   — start both, watched
//   pm2 status                      — see if they're up
//   pm2 logs                        — see recent output/crash reasons
//   pm2 restart all                 — manual restart of both
//   pm2 stop all                    — stop both
module.exports = {
  apps: [
    {
      name: "one-touch-backend",
      cwd: "./backend",
      script: "src/server.js",
      // If it crashes, PM2 restarts it automatically. If it keeps
      // crashing right away (a real bug, not a blip), stop trying after
      // 10 attempts instead of restart-looping forever.
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      out_file: "../logs/backend-out.log",
      error_file: "../logs/backend-error.log",
      time: true,
    },
    {
      name: "one-touch-frontend",
      cwd: "./frontend",
      // Windows can't run "npm" (a .cmd file) as a PM2 script directly —
      // it gets executed with node and fails on the batch-file syntax.
      // Calling Vite's own JS entry point sidesteps npm entirely.
      script: "node_modules/vite/bin/vite.js",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      out_file: "../logs/frontend-out.log",
      error_file: "../logs/frontend-error.log",
      time: true,
    },
  ],
};
