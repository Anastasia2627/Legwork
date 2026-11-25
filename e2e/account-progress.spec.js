import {test,expect} from '@playwright/test';

test('Student account shows true owned progress and clear lesson completion',async({page},info)=>{
 const email='library-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Library Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('StudentLibraryPassword!243');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await expect(page.locator('.account-continue')).toContainText('0 / 1 LESSONS · 0%');
 await expect(page.locator('.account-continue [role="progressbar"]')).toHaveAttribute('aria-valuenow','0');

 await page.locator('.cabinet-nav [data-tab="lessons"]').click();
 await expect(page.locator('.student-library-group .account-section-head')).toContainText('0 / 1 · 0%');
 await expect(page.locator('#studentLibraryMount [role="status"]')).toContainText('1 / 1 classes shown');
 const cards=page.locator('.cabinet-main .lesson-card');
 await expect(cards).toHaveCount(1);
 await expect(cards.first().locator('.lesson-library-status')).toHaveText('IN YOUR LIBRARY');
 await expect(cards.first().locator('.card-body .row')).toContainText('Study');
 await expect(cards.first().locator('a[href="#/study/1"]')).toHaveCount(3);

 await page.goto('/#/study/1');
 await expect(page.locator('#studyComplete')).toBeVisible();
 await page.locator('#studyComplete').click();
 await expect(page.locator('#studyComplete')).toContainText(/Completed|Completada/);

 await page.goto('/#/account');
 // My Lessons tab is remembered across route navigation.
 await page.locator('.cabinet-nav [data-tab="overview"]').click();
 await expect(page.locator('.account-continue')).toContainText('1 / 1 LESSONS · 100%');
 await expect(page.locator('.account-continue [role="progressbar"]')).toHaveAttribute('aria-valuenow','100');
 await expect(page.locator('.account-continue .btn')).toHaveText('REVISIT');
 await page.locator('.cabinet-nav [data-tab="lessons"]').click();
 await expect(page.locator('.lesson-card.is-complete .lesson-library-status')).toHaveText('COMPLETED');
 await expect(page.locator('.lesson-card.is-complete .btn')).toHaveText('Revisit');
});
