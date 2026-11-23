import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
 use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
 projects: [ { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } }, { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } } ],
 webServer: { command: 'npm run start', url: 'http://localhost:3000/login', reuseExistingServer: false, env: { LOCAL_PRODUCTION_TEST: 'true' }, timeout: 60000 },
});
