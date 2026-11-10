import {test,expect} from '@playwright/test';

test('Only authorized users can load a YouTube iframe for a paid lesson',async({page})=>{
 const id='dQw4w9WgXcQ';
 await page.goto('/#/study/2');
 await expect(page.locator('#studyVideoHost iframe')).toHaveCount(0);
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 const editor=page.locator('[data-lesson-full="2"]');
 await editor.locator('xpath=..').locator('summary').click();
 await editor.locator('[name="video_url"]').fill('https://youtu.be/'+id);
 await editor.locator('button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('Lesson details updated');
 await page.goto('/#/study/2');
 const iframe=page.locator('#studyVideoHost iframe');
 await expect(iframe).toHaveCount(1);
 await expect(iframe).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/'+id+'?rel=0&playsinline=1');
 await expect(iframe).toHaveAttribute('referrerpolicy','strict-origin-when-cross-origin');
 await page.goto('/#/account');
 await page.locator('[data-tab="admin"]').click();
 const cleanup=page.locator('[data-lesson-full="2"]');
 await cleanup.locator('xpath=..').locator('summary').click();
 await cleanup.locator('[name="video_url"]').fill('');
 await cleanup.locator('button[type="submit"]').click();
});

test('Account security is accessible from student profile',async({page},info)=>{
 const email='session-controls-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Security Controls Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('StrongUniqueSessionPassword-2026');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('.cabinet-nav [data-tab="profile"]').click();
 await expect(page.locator('#revokeSessionsForm')).toBeVisible();
 await page.locator('#revokeSessionsForm [name="password"]').fill('StrongUniqueSessionPassword-2026');
 await page.locator('#revokeSessionsForm button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('Other devices have been signed out');
 await expect(page.locator('#revokeSessionsForm')).toBeVisible();
});
