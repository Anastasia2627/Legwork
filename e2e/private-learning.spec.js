import {test,expect} from '@playwright/test';

const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');

test('Teacher can publish and remove a private PDF from the admin dashboard',async({page})=>{
 await page.goto('/#/login');
 await page.locator('#authForm [name="email"]').fill('Admin');
 await page.locator('#authForm [name="password"]').fill('LegworkTestAdminPassword-2026-only');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.locator('.cabinet-nav [data-tab="admin"]').click();
 const panel=page.locator('.admin-study-files');
 await expect(panel).toBeVisible();
 await panel.locator('#adminMaterialLesson').selectOption('1');
 await panel.locator('[name="title"]').fill('Pole technique PDF checklist');
 await panel.locator('[name="pdf"]').setInputFiles({name:'checklist.pdf',mimeType:'application/pdf',buffer:pdf});
 await panel.locator('#adminLessonMaterialForm button').click();
 await expect(page.locator('#toast')).toContainText('Private lesson PDF published');
 await expect(page.locator('.admin-study-files')).toContainText('Pole technique PDF checklist');
 await expect(page.locator('.admin-study-files [data-remove-material]')).toHaveCount(1);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.admin-study-files [data-remove-material]').click();
 await expect(page.locator('#toast')).toContainText('Private lesson PDF removed');
 await expect(page.locator('.admin-study-files')).toContainText('No PDF notes published for this lesson');
});

test('Learning workspace shows notes and only Guru file uploader, without breaking HTTPS practice links',async({page})=>{
 const email='lesson-private-ui-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Practice UI Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('PracticeUiStudentPassword-2026');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.goto('/#/study/1');
 await expect(page.locator('.study-materials')).toBeVisible();
 await expect(page.locator('.study-materials')).toContainText('No PDF study notes');
 await expect(page.locator('#studyHomeworkForm')).toBeVisible();
 await expect(page.locator('#studyFileUploadForm')).toHaveCount(0);
 await expect(page.locator('.study-homework')).toContainText('Guru plan');
 await page.locator('#homeworkUrl').fill('https://example.org/secure-practice-video');
 await page.locator('#studyHomeworkForm button').click();
 await expect(page.locator('#toast')).toContainText('Progress saved');
 await expect(page.locator('#homeworkUrl')).toHaveValue('https://example.org/secure-practice-video');
});
