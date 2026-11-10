import {test,expect} from '@playwright/test';

test('course page shows a readable hierarchy, clear choices and loaded styles',async ({page})=>{
 const failedStyles=[];
 page.on('response',response=>{if(response.url().includes('/css/')&&response.status()>=400)failedStyles.push(response.status())});
 await page.goto('/#/course');
 await expect(page.locator('.ref-course-hero h1')).toBeVisible();
 expect(failedStyles).toEqual([]);
 await expect(page.locator('.course-fit-item')).toHaveCount(4);
 await expect(page.locator('.course-pricing-section .price-card')).toHaveCount(2);
 await expect(page.locator('.course-journey-grid')).toHaveCount(0);
 await expect(page.locator('.course-lesson-grid')).toBeVisible();
 const sizes=await page.evaluate(()=>{
  const hero=getComputedStyle(document.querySelector('.ref-course-hero h1'));
  const cards=getComputedStyle(document.querySelector('.course-fit-list'));
  return {heroSize:parseFloat(hero.fontSize),font:hero.fontFamily,body:parseFloat(getComputedStyle(document.body).fontSize),columns:cards.gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth+4};
 });
 expect(sizes.font).toContain('Archivo Black');
 expect(sizes.body).toBeGreaterThanOrEqual(16);
 expect(sizes.heroSize).toBeLessThanOrEqual(70);
 expect(sizes.overflow).toBe(false);
});

test('mobile course, classes and mentorship keep controls visible',async ({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const [route,required] of [
  ['/#/course','.course-pricing-section'],
  ['/#/shop','#shopSearch'],
  ['/#/mentorship','#mentorshipForm']
 ]){
  await page.goto(route);
  await expect(page.locator(required)).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+4)).toBe(true);
 }
});
