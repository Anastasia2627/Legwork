import {test,expect} from '@playwright/test';

test('Public navigation and catalog filters',async({page},info)=>{
 await page.goto('/#/');
 await expect(page.locator('h1')).toContainText('MOVE LIKE');
 await page.goto('/#/course');
 await expect(page.locator('.course-logo')).toContainText('LEGWORK');
 await expect(page.locator('#prices .price-card')).toHaveCount(2);
 await page.goto('/#/shop');
 await expect(page.locator('h1')).toContainText('CLASSES');
 await expect(page.locator('.catalog-direction')).toHaveCount(3);
 await page.locator('#filterCategory').selectOption('Legwork');
 await expect(page).toHaveURL(/category=Legwork/);
 await expect(page.locator('.lesson-card').first()).toBeVisible();
 await page.locator('#shopSearch').fill('Knee Circle');
 await page.locator('#shopSearch').press('Enter');
 await expect(page.locator('.lesson-card')).toHaveCount(1);
});

test('Student can register and complete introductory lesson in classroom',async({page},info)=>{
 const email='e2e-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Test Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('LongRandomTestPassword!2410');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await expect(page.locator('.cabinet-main h2').first()).toContainText('TEST STUDENT');
 await page.goto('/#/lesson/1');
 await expect(page.locator('[data-watch="1"]')).toBeVisible();
 await page.locator('[data-watch="1"]').click();
 await expect(page).toHaveURL(/#\/study\/1/);
 await expect(page.locator('.study-title')).toContainText('Prestart');
 if(info.project.name==='mobile-chromium'){
   await expect(page.locator('#toggleSyllabus')).toBeVisible();
   await page.locator('#toggleSyllabus').click();
   await expect(page.locator('#studySidebar')).toBeVisible();
 }else{
   await expect(page.locator('.study-sidebar')).toBeVisible();
 }
 await page.locator('#studyComplete').click();
 await expect(page.locator('#studyComplete')).toContainText(/Completed|Completada/);
 await page.goto('/#/account');
 await page.locator('[data-tab="achievements"]').click();
 await expect(page.locator('.cabinet-main')).toContainText('1 lessons completed');
});

test('Non-admin student cannot open paid classroom',async({page},info)=>{
 const email='unpaid-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Unpaid Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('LongRandomTestPassword!8765');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.goto('/#/study/2');
 await expect(page.locator('main')).toContainText('This lesson is not part of your library');
});

test('Admin sign-in opens staff dashboard',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 await expect(page.locator('.cabinet-main')).toContainText('ADMIN STUDIO');
 await expect(page.locator('#adminMount')).toContainText('GURU HOMEWORK REVIEW QUEUE');
});
