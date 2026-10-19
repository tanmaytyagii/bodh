import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a running stack: start the API (`make api`) first.
// Playwright builds and starts the web app itself, on a port of its own (3100,
// or PORT), unless a server is already there. Not the development server on
// 3000: Next.js lets only localhost use its dev-only connections, so pages it
// serves to 127.0.0.1 never become interactive. The tests pass whether or not a
// language model is configured.

const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
