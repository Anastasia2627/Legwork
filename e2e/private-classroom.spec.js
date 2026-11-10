import {test,expect} from '@playwright/test';

test('Student uploads a private practice clip and keeps it after completing the free lesson',async({page},info)=>{
 const email='clip-homework-'+info.project.name+'-'+Date.now()+'@example.test';
 await page.goto('/#/register');
 await page.locator('#authForm [name="name"]').fill('Practice Clip Student');
 await page.locator('#authForm [name="email"]').fill(email);
 await page.locator('#authForm [name="password"]').fill('VideoHomeworkTestPassword-2026');
 await page.locator('#authForm button[type="submit"]').click();
 await expect(page).toHaveURL(/#\/account/);
 await page.goto('/#/study/1');
 await expect(page.locator('.study-title')).toContainText('Prestart');
 const file=Buffer.alloc(512,0x42);file.writeUInt32BE(24,0);file.write('ftyp',4);file.write('isom',8);
 await page.locator('#studyVideoFile').setInputFiles({name:'homework.mp4',mimeType:'video/mp4',buffer:file});
 await page.locator('#studyUploadHomework').click();
 await expect(page.locator('.study-uploaded a')).toHaveAttribute('href','/api/homework-videos/1');
 const privateResponse=await page.request.get('/api/homework-videos/1',{headers:{Range:'bytes=0-15'}});
 expect(privateResponse.status()).toBe(206);
 expect(privateResponse.headers()['cache-control']).toBe('private, no-store');
 await page.locator('#studyComplete').click();
 await expect(page.locator('#studyComplete')).toContainText(/Completed|Completada/);
 await expect(page.locator('.study-uploaded a')).toHaveAttribute('href','/api/homework-videos/1');
});
