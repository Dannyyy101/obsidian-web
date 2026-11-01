import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/** E2E-Tests gegen den Dev-Server in Chromium, Firefox und WebKit (`pnpm test:e2e`). */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Standard wäre die halbe Kernzahl, auf dem CI-Runner (4 vCPUs) also 2. Die Tests warten meist auf
  // den Browser statt zu rechnen, da reichen die Kerne auch für 4.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
