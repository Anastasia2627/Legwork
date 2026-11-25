import {test,expect} from '@playwright/test';

async function openStaff(page){
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('[data-tab="admin"]').click();
 await expect(page.locator('#lessonForm [data-preview-root]')).toBeVisible();
}

test('Unsaved lesson creation preview changes with title, price and video, with no uploads',async({page})=>{
 let imageUploads=0;
 page.on('request',request=>{if(request.url().includes('/api/admin/image-upload'))imageUploads++});
 await openStaff(page);
 const form=page.locator('#lessonForm');
 const preview=form.locator('[data-preview-root]');
 await expect(preview.locator('[data-preview-price]')).toHaveText('$15.00');

 const title='<b>Safe preview title</b>';
 await form.locator('[name="title"]').fill(title);
 await expect(preview.locator('[data-preview-title]')).toHaveText(title);
 await expect(preview.locator('b')).toHaveCount(0);
 await form.locator('[name="price"]').fill('2250');
 await expect(preview.locator('[data-preview-price]')).toHaveText('$22.50');
 await form.locator('[name="duration"]').fill('45');
 await expect(preview.locator('[data-preview-meta]')).toContainText('45 min');
 await form.locator('[name="free"]').check();
 await expect(preview.locator('[data-preview-price]')).toHaveText('FREE');
 await form.locator('[name="video_url"]').fill('https://youtu.be/dQw4w9WgXcQ');
 const video=preview.locator('[data-preview-video-link]');
 await expect(video).toBeVisible();
 await expect(video).toHaveAttribute('href','https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 await expect(preview.locator('iframe')).toHaveCount(0);

 await form.locator('[name="video_url"]').fill('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
 await expect(video).toBeHidden();
 await expect(preview.locator('[data-preview-video]')).toContainText('Invalid YouTube link');
 await expect.poll(()=>imageUploads).toBe(0);
});

test('Cover preview accepts a local image, removes it without saving and keeps URL input',async({page})=>{
 let uploads=0;
 page.on('request',request=>{if(request.url().includes('/api/admin/image-upload'))uploads++});
 await openStaff(page);
 const form=page.locator('#lessonForm');
 const preview=form.locator('[data-preview-root]');
 const cover=preview.locator('[data-preview-image]');
 await expect(cover).toBeHidden();
 // One-pixel PNG; no customer photo or licensed image is used in test.
 await form.locator('[name="upload_image"]').setInputFiles({
  name:'test-cover.png',mimeType:'image/png',
  buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLajwAAAABJRU5ErkJggg==','base64')
 });
 await expect(cover).toBeVisible();
 await expect(cover).toHaveAttribute('src',/^blob:/);
 await expect(preview.locator('[data-preview-image-status]')).toContainText('only when you save');
 await expect.poll(()=>uploads).toBe(0);
 await form.locator('[name="upload_image"]').setInputFiles([]);
 await expect(cover).toBeHidden();
 await expect(preview.locator('[data-preview-placeholder]')).toBeVisible();
});

test('Existing lesson editor shows preview without fetching a protected video',async({page})=>{
 await openStaff(page);
 await page.locator('#adminLessonSearch').fill('Knee Circle');
 const row=page.locator('#adminLessonList .admin-edit-lesson:visible').first();
 await row.locator('summary').click();
 const form=row.locator('form[data-lesson-full]');
 await expect(form.locator('[data-preview-root]')).toBeVisible();
 const original=await form.locator('[name="title"]').inputValue();
 await expect(form.locator('[data-preview-title]')).toHaveText(original);
 await form.locator('[name="title"]').fill('Updated preview - not saved');
 await expect(form.locator('[data-preview-title]')).toHaveText('Updated preview - not saved');
 await expect(form.locator('[data-preview-root] iframe')).toHaveCount(0);
 await page.reload();
 await page.locator('[data-tab="admin"]').click();
 await page.locator('#adminLessonSearch').fill('Knee Circle');
 const rowAfter=page.locator('#adminLessonList .admin-edit-lesson:visible').first();
 await rowAfter.locator('summary').click();
 await expect(rowAfter.locator('[name="title"]')).toHaveValue(original);
});
