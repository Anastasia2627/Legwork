import {test,expect} from '@playwright/test';

test('Direct editorial routes expose localized canonical metadata and crawlable links',async({page})=>{
 const response=await page.goto('/es');
 expect(response.status()).toBe(200);
 await expect(page.locator('html')).toHaveAttribute('lang','es');
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/es$/);
 await expect(page.locator('link[hreflang="en"]')).toHaveAttribute('href',/\/$/);
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,nofollow');
 await expect(page.locator('#nav a[data-i18n="mentorship"]')).toHaveAttribute('href','/es/mentorship');
 await page.locator('#langBtn').click();
 await expect(page).toHaveURL(/\/$/);
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.goto('/courses');
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',/\/courses$/);
 await page.goto('/#/login');
 await expect(page.locator('#authForm')).toBeVisible();
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
 await expect(page.locator('script#publicSeoSchema')).toHaveCount(0);
});

test('Preview robots, sitemap and unknown course status remain closed',async({request})=>{
 const robots=await request.get('/robots.txt');
 expect(await robots.text()).toContain('Disallow: /');
 expect((await request.get('/sitemap.xml')).status()).toBe(404);
 expect((await request.get('/course/not-a-published-course')).status()).toBe(404);
 const alias=await request.get('/course/legwork-lab',{maxRedirects:0});
 expect(alias.status()).toBe(301);
 expect(alias.headers().location).toBe('/course');
});
