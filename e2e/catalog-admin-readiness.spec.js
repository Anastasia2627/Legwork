import {test,expect} from '@playwright/test';

test('Live class search keeps other filters and allows clearing only the search term',async({page})=>{
 await page.goto('/#/shop?category=Legwork');
 const search=page.locator('#shopSearch');
 await expect(search).toBeVisible();
 await search.fill('Knee Circle');
 await expect(page.locator('.shop-results-grid .lesson-card')).toHaveCount(1);
 await expect(page.locator('.shop-active-chip[data-shop-search-clear="1"]')).toContainText('Knee Circle');
 await expect(page).toHaveURL(/category=Legwork/);
 await expect(page).toHaveURL(/q=Knee/);
 await expect(page.locator('#shopSearch')).toBeFocused();

 await page.locator('[data-shop-search-clear="1"]').click();
 await expect(page).toHaveURL(/category=Legwork/);
 await expect(page).not.toHaveURL(/\bq=/);
 await expect(page.locator('.shop-active-chip[data-shop-search-clear]')).toHaveCount(0);
 await expect(page.locator('.shop-results-grid .lesson-card').first()).toBeVisible();

 await page.locator('#shopSearch').fill('Wave');
 await page.locator('#shopSearchApply').click();
 await expect(page).toHaveURL(/q=Wave/);
 await expect(page.locator('.shop-results-grid .lesson-card').first()).toBeVisible();
});

test('Admin material checklist opens the exact lesson editor without mutating content',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 const queue=page.locator('.admin-content-readiness');
 await expect(queue).toContainText('Complete your lesson library');
 const first=queue.locator('.admin-readiness-row[data-jump-admin^="admin-lesson-detail-"]').first();
 await expect(first).toBeVisible();
 const id=await first.getAttribute('data-jump-admin');
 await first.click();
 const editor=page.locator('#'+id);
 await expect(editor).toHaveAttribute('open','');
 await expect(editor.locator('[name="video_url"]')).toBeVisible();
 await expect(editor.locator('[name="upload_image"]')).toBeVisible();
});

test('Admin can filter large lesson editor list without saving or losing data',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/account/);
 await page.locator('[data-tab="admin"]').click();
 const input=page.locator('#adminLessonSearch');
 await expect(input).toBeVisible();
 await input.fill('Knee Circle');
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible')).toHaveCount(1);
 await expect(page.locator('#adminLessonCount')).toContainText('Showing 1 of');
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible summary')).toContainText('Knee Circle');
 await page.locator('#adminLessonStatus').selectOption('missing-video');
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible')).toHaveCount(1);
 await page.locator('#adminLessonStatus').selectOption('complete');
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible')).toHaveCount(0);
 await input.fill('');
 await page.locator('#adminLessonStatus').selectOption('all');
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible').first()).toBeVisible();
});

test('Admin stays on the same lesson after saving, with search restored',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 const search=page.locator('#adminLessonSearch');
 await search.fill('Knee Circle');
 const editor=page.locator('#adminLessonList .admin-edit-lesson:visible').first();
 const id=await editor.getAttribute('id');
 await editor.locator('summary').click();
 const form=editor.locator('form[data-lesson-full]');
 await expect(form).toBeVisible();
 const title=await form.locator('[name="title"]').inputValue();
 await form.locator('button[type="submit"]').click();
 const restored=page.locator('#'+id);
 await expect(restored).toHaveAttribute('open','');
 await expect(page.locator('#adminLessonSearch')).toHaveValue('Knee Circle');
 await expect(restored.locator('[name="title"]')).toHaveValue(title);
 await expect(page.locator('#adminLessonList .admin-edit-lesson:visible')).toHaveCount(1);
});

test('An unavailable waitlist does not hide course and lesson editors',async({page})=>{
 await page.route('**/api/admin/waitlist',route=>route.fulfill({
  status:503,contentType:'application/json',body:'{"error":"Temporarily unavailable"}'
 }));
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 await expect(page.locator('#adminLessonSearch')).toBeVisible();
 await expect(page.locator('#adminLessonList .admin-edit-lesson').first()).toBeAttached();
 await expect(page.locator('.admin-section-unavailable')).toContainText('Waitlist unavailable');
 await expect(page.locator('#adminCourseEditor')).toBeAttached();
});
