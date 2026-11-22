import {test,expect} from '@playwright/test';

test('Homepage restores the full story and teaching options in the premium design',async({page})=>{
 await page.goto('/#/');
 await expect(page.locator('.home-hero h1')).toContainText('SVITLANA');
 await expect(page.locator('.home-story .home-journey-item')).toHaveCount(5);
 await expect(page.locator('.home-method .home-method-item')).toHaveCount(4);
 await expect(page.locator('.home-courses .home-program-primary')).toHaveCount(1);
 await expect(page.locator('.home-courses .home-program-link')).toHaveCount(2);
 await expect(page.locator('.home-recognition .home-tabs button')).toHaveCount(3);
 await expect(page.locator('.home-free-invite')).toBeVisible();
 await expect(page.locator('.home-program-primary')).toHaveAttribute('href','#/course');
 // Empty/unauthorized photo and review slots are not fabricated for visitors.
 await expect(page.locator('.home-gallery')).toHaveCount(0);
 await expect(page.locator('.home-reviews-published')).toHaveCount(0);
 const order=await page.locator('#app > section').evaluateAll(items=>items.map(el=>
  ['home-hero','home-story','home-method','home-courses','home-recognition','home-free-invite']
   .find(cls=>el.classList.contains(cls))));
 expect(order).toEqual(['home-hero','home-story','home-method','home-courses','home-recognition','home-free-invite']);
});

test('Experience tabs retain accessible state and update their content',async({page})=>{
 await page.goto('/#/');
 const tab=page.locator('[data-showtab="shows"]');
 await tab.click();
 await expect(tab).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#showsPanel')).toContainText('SHOWS');
 await page.locator('[data-showtab="judging"]').click();
 await expect(page.locator('#showsPanel')).toContainText('JUDGING & POLECON');
});

test('Homepage stays in viewport with the restored premium sections',async({page})=>{
 for(const width of [320,375,580,768,1280]){
  await page.setViewportSize({width,height:820});
  await page.goto('/#/');
  await expect(page.locator('.home-hero h1')).toBeVisible();
  const size=await page.evaluate(()=>({body:document.body.scrollWidth,html:document.documentElement.scrollWidth,view:window.innerWidth}));
  expect(size.body,'body at '+width).toBeLessThanOrEqual(size.view+2);
  expect(size.html,'document at '+width).toBeLessThanOrEqual(size.view+2);
 }
});
