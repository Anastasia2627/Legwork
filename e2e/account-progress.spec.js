import {test,expect} from '@playwright/test';

test('Student account shows real accessible progress and a useful My Lessons view',async({page},testInfo)=>{
 const email='library-'+testInfo.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Library Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('StudentLibraryPassword!243');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 const overview=page.locator('.account-continue');
 await expect(overview).toContainText('0 / 1 LESSONS · 0% COMPLETE');
 await expect(overview.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow','0');

 await page.locator('.cabinet-nav [data-tab="lessons"]').click();
 await expect(page.locator('.cabinet-main')).toContainText('0 of 1 accessible lessons completed');
 await expect(page.locator('.cabinet-main .lesson-card')).toHaveCount(1);

 await page.goto('/#/study/1');
 await expect(page.locator('#studyComplete')).toBeVisible();
 await page.locator('#studyComplete').click();
 await expect(page.locator('#studyComplete')).toContainText(/Completed|Completada/);
 await page.goto('/#/account');
 // Switching back from the course player preserves the last cabinet tab.
 await page.locator('.cabinet-nav [data-tab="overview"]').click();
 await expect(page.locator('.account-continue')).toContainText('1 / 1 LESSONS · 100% COMPLETE');
 await expect(page.locator('.account-continue [role="progressbar"]')).toHaveAttribute('aria-valuenow','100');
});
