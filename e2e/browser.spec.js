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
 await expect(page.locator('.lesson-card').nth(1).locator('a').first()).toHaveAttribute('href',/#\/lesson\//);
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

test('Admin can publish a bundle, and it appears in the shop and cart',async({page},info)=>{
 const suffix=info.project.name.replace(/[^a-z0-9-]/g,'-');
 const title='Practice bundle '+suffix;
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 await expect(page.locator('#bundleCreateForm')).toBeVisible();
 const form=page.locator('#bundleCreateForm');
 await form.locator('[name="title"]').fill(title);
 await form.locator('[name="slug"]').fill('practice-bundle-'+suffix);
 await form.locator('[name="direction"]').fill('Legwork');
 await form.locator('[name="description"]').fill('Three technique lessons');
 await form.locator('[name="price"]').fill('3200');
 await form.locator('[name="original_price"]').fill('4500');
 await form.locator('[name="lesson_ids"]').selectOption(['4','5','6']);
 await form.locator('button').click();
 await expect(page.locator('#adminMount')).toContainText(title);
 await page.goto('/#/shop');
 const card=page.locator('.bundle-card').filter({hasText:title}).first();
 await expect(card).toBeVisible();
 await card.locator('[data-cart-bundle]').click();
 await page.locator('#cartBtn').click();
 await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
 await expect(page.locator('#cartBody')).toContainText(title);
 await expect(page.locator('#cartBody')).toContainText('$32');
});

test('Payment controls stay disabled without merchant configuration',async({page},info)=>{
 const email='payment-off-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Payment Preview');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('Strong-Temporary-Password-2026');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.goto('/#/course');
 await page.locator('#prices [data-order="course"]').first().click();
 await expect(page).toHaveURL(/#\/account/);
 await expect(page.locator('.cabinet-main')).toContainText('PAYMENT CHECKOUT');
 await expect(page.locator('.cabinet-main')).toContainText('Online checkout is not configured yet');
 await expect(page.locator('#beginPayment')).toHaveCount(0);
 await expect(page.locator('.payment-order-list input')).toBeDisabled();
});

test('Forgot password and invalid reset links show safe messages',async({page})=>{
 await page.goto('/#/login');
 await expect(page.locator('a[href="#/forgot-password"]')).toBeVisible();
 await page.locator('a[href="#/forgot-password"]').click();
 await expect(page.locator('h2').first()).toContainText('RESET YOUR PASSWORD');
 await page.locator('#forgotPasswordForm [name="email"]').fill('unknown-student@example.test');
 await page.locator('#forgotPasswordForm button').click();
 await expect(page.locator('#toast')).toContainText('If the address is registered');
 await page.goto('/#/reset-password/invalid');
 await expect(page.locator('main')).toContainText('INVALID RESET LINK');
});
