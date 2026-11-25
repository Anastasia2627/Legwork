import {test,expect} from '@playwright/test';

test('Homepage restores the full story and teaching options in the premium design',async({page})=>{
 await page.goto('/#/');
 await expect(page.locator('.home-hero h1')).toContainText('SVITLANA');
 await expect(page.locator('.home-story .home-journey-item')).toHaveCount(5);
 await expect(page.locator('.home-method .home-method-item')).toHaveCount(4);
 await expect(page.locator('.home-courses .home-program-primary')).toHaveCount(1);
 await expect(page.locator('.home-courses .home-program-link')).toHaveCount(0);
 await expect(page.locator('.home-program-grid')).toHaveClass(/is-single/);
 await expect(page.locator('.home-recognition .home-tabs button')).toHaveCount(3);
 await expect(page.locator('.home-free-invite')).toBeVisible();
 await expect(page.locator('.home-program-primary')).toHaveAttribute('href','#/course');
 // Approved media may or may not exist depending on prior admin tests.
 // When sections appear, every card must contain a real admin-assigned image.
 const gallery=page.locator('.home-gallery .gallery-frame');
 const reviews=page.locator('.home-reviews-published .home-review-frame');
 expect(await gallery.count()).toBe(await page.locator('.home-gallery img[src]').count());
 expect(await reviews.count()).toBe(await page.locator('.home-reviews-published img[src]').count());
 const required=['home-hero','home-story','home-method','home-courses','home-recognition','home-free-invite'];
 const order=await page.locator('#app > section').evaluateAll(items=>items.map(el=>
  ['home-hero','home-story','home-method','home-courses','home-recognition','home-gallery','home-reviews-published','home-free-invite']
   .find(cls=>el.classList.contains(cls))));
 expect(order.filter(cls=>required.includes(cls))).toEqual(required);
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
