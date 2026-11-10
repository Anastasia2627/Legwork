import {test,expect} from '@playwright/test';

// Regression test for the broken screenshot where new app.js was rendered with
// outdated HTML/CSS: gigantic hero text and all page grids missing.
test('course stylesheet is served and applies the intended hierarchy',async ({page},testInfo)=>{
 const failedCss=[];
 page.on('response',response=>{
  if(response.url().includes('/css/') && response.status()>=400)failedCss.push(response.url()+' '+response.status());
 });
 await page.goto('/#/course');
 const hero=page.locator('.ref-course-hero');
 await expect(hero).toBeVisible();
 expect(failedCss).toEqual([]);
 const stylesheet=await page.request.get('/css/pages/course.css');
 expect(stylesheet.status()).toBe(200);
 expect(await stylesheet.text()).toContain('.course-audience');
 const metrics=await page.evaluate(()=>{
  const heading=document.querySelector('.ref-course-hero h1');
  const bar=document.querySelector('.ref-course-bar');
  const audience=document.querySelector('.ref-targets');
  const firstCard=document.querySelector('.course-audience');
  const lessonGrid=document.querySelector('.course-lesson-grid');
  const resultList=document.querySelector('.course-outcome-list');
  return {
   headingSize:parseFloat(getComputedStyle(heading).fontSize),
   headingFont:getComputedStyle(heading).fontFamily,
   barDisplay:getComputedStyle(bar).display,
   audienceColumns:getComputedStyle(audience).gridTemplateColumns.split(' ').length,
   cardRadius:getComputedStyle(firstCard).borderTopLeftRadius,
   lessonsDisplay:getComputedStyle(lessonGrid).display,
   listStyle:getComputedStyle(resultList).listStyleType
  };
 });
 expect(metrics.headingSize).toBeLessThanOrEqual(testInfo.project.name.includes('mobile')?45:60);
 expect(metrics.headingFont).toContain('Archivo Black');
 expect(metrics.barDisplay).toBe('none');
 expect(metrics.audienceColumns).toBeGreaterThanOrEqual(2);
 expect(metrics.cardRadius).toBe('6px');
 expect(metrics.lessonsDisplay).toBe('grid');
 expect(metrics.listStyle).toBe('none');
});
