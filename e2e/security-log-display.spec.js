import {test,expect} from '@playwright/test';

test('Security activity is visible to school administrators without displaying secrets',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('.cabinet-nav [data-tab="admin"]').click();
 const section=page.locator('.admin-security-section');
 await expect(section).toBeVisible();
 await expect(section).toContainText('SECURITY ACTIVITY');
 await expect(section.locator('.audit-event').first()).toBeVisible();
 await expect(section).toContainText('auth · login');
 await expect(section).not.toContainText('LegworkTestAdminPassword-2026-only');
});
