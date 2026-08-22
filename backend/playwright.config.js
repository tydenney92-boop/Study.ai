const { defineConfig, devices } = require("@playwright/test");

const port = Number(process.env.E2E_PORT || 4173);

module.exports = defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.js",
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 45_000,
    expect: { timeout: 7_000 },
    reporter: [["list"]],
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    outputDir: "test-results/e2e-artifacts",
    webServer: {
        command: "node e2e/support/e2e-server.js",
        url: `http://127.0.0.1:${port}/health/live`,
        reuseExistingServer: false,
        timeout: 30_000,
        stdout: "pipe",
        stderr: "pipe"
    }
});
