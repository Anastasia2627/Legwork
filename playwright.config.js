import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',
 timeout:30000,
 expect:{timeout:8000},
 retries:process.env.CI?1:0,
 workers:process.env.CI?2:undefined,
 reporter:process.env.CI?'github':'list',
 use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
 projects:[
  {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
  {name:'mobile-chromium',use:{...devices['iPhone 13'],browserName:'chromium'}}
 ],
 webServer:{
  command:'node server.js',
  url:'http://127.0.0.1:3000/health',
  reuseExistingServer:!process.env.CI,
  timeout:30000,
  env:{
   NODE_ENV:'test',PORT:'3000',
   SITE_ORIGIN:'http://127.0.0.1:3000',
   DATABASE_PATH:'./data/browser-test.sqlite',
   SESSION_SECRET:'legwork-local-browser-test-secret-not-used-in-production',
   ADMIN_PASSWORD:'LegworkTestAdminPassword-2026-only'
  }
 }
});
