import { defineConfig, devices } from '@playwright/test';

const PORT = 4391;
const BASE = `http://localhost:${PORT}/boba-tycoon/`;

// chromium-phone gates the deploy. The others run in a separate, non-gating CI job.
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    {
      name: 'chromium-phone',
      use: { ...devices['Pixel 7'], browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    },
    {
      name: 'chromium-desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-landscape',
      use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'chromium-small',
      use: { browserName: 'chromium', viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true },
    },
    {
      name: 'webkit-phone',
      use: { ...devices['iPhone 14'], browserName: 'webkit', launchOptions: {} },
      grep: /@smoke/,
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
