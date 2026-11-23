import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'list',
    timeout: 60000,
    expect: {
        timeout: 10000,
    },
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://localhost:30080',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : {
              command: 'node ../server.js',
              url: 'http://localhost:30080',
              reuseExistingServer: !process.env.CI,
              stdout: 'pipe',
              stderr: 'pipe',
              env: {
                  PORT: '30080',
              },
          },
});
