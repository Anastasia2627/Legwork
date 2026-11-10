import {test,expect} from '@playwright/test';

test('About page follows the supplied nine-section wireframe',async({page})=>{
 await page.goto('/#/');
 await expect(page.locator('.home-hero h1')).toContainText('SVITLANA');
 await expect(page.locator('.home-story .ref-time-item')).toHaveCount(5);
 await expect(page.locator('.home-why .ref-reason')).toHaveCount(4);
 await expect(page.locator('.home-courses .ref-featured')).toHaveCount(1);
 await expect(page.locator('.home-courses .ref-upcoming > div')).toHaveCount(2);
 await expect(page.locator('.home-recognition .home-tabs button')).toHaveCount(3);
 await expect(page.locator('.home-workshops .home-carousel-item')).toHaveCount(5);
 await expect(page.locator('.home-reviews .home-carousel-item')).toHaveCount(6);
 await expect(page.locator('.home-free-strip #subscribeForm')).toBeVisible();
 await expect(page.locator('.ref-featured')).toHaveAttribute('href','#/course');
 const actualOrder=await page.locator('#app > section').evaluateAll(items=>items.map(el=>
  ['home-hero','home-story','home-why','home-courses','home-recognition','home-workshops','home-reviews','home-free-strip'].find(cls=>el.classList.contains(cls))));
 expect(actualOrder).toEqual(['home-hero','home-story','home-why','home-courses','home-recognition','home-workshops','home-reviews','home-free-strip']);
});

test('About experience tabs and both gallery arrows work',async({page})=>{
 await page.goto('/#/');
 const tab=page.locator('[data-showtab="shows"]');
 await tab.click();
 await expect(tab).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#showsPanel')).toContainText('SHOWS');
 await page.locator('[data-showtab="judging"]').click();
 await expect(page.locator('#showsPanel')).toContainText('JUDGING & POLECON');
 for(const target of ['workshops','reviews']){
  const track=page.locator('#home-'+target+'-track');
  const before=await track.evaluate(el=>el.scrollLeft);
  await page.locator('[data-home-slide="next"][data-home-target="'+target+'"]').click();
  await expect.poll(()=>track.evaluate(el=>el.scrollLeft)).toBeGreaterThan(before);
 }
});

test('About stays inside all tested viewport widths',async({page})=>{
 for(const width of [320,375,580,768,1280]){
  await page.setViewportSize({width,height:820});
  await page.goto('/#/');
  await expect(page.locator('.home-hero h1')).toBeVisible();
  const size=await page.evaluate(()=>({body:document.body.scrollWidth,html:document.documentElement.scrollWidth,view:window.innerWidth}));
  expect(size.body,'body at '+width).toBeLessThanOrEqual(size.view+2);
  expect(size.html,'document at '+width).toBeLessThanOrEqual(size.view+2);
 }
});
