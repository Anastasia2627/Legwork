import {test,expect} from '@playwright/test';

test('Classes follow reference structure without a grid of promotional panels',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/#/shop');
 await expect(page.locator('.shop-heading h1')).toHaveText('CLASSES');
 await expect(page.locator('.shop-promo')).toBeVisible();
 await expect(page.locator('.shop-sidebar')).toBeVisible();
 await expect(page.locator('.shop-catalog #shopSearch')).toBeVisible();
 await expect(page.locator('.shop-direction').first()).toBeVisible();
 await expect(page.locator('.shop-lesson-rail').first()).toBeVisible();
 await expect(page.locator('.shop-course-link')).toBeAttached();
 await expect(page.locator('.shop-faq')).toBeAttached();
 const columns=await page.locator('.shop-layout').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 expect(columns).toBe(2);
});

test('Mobile Classes drawer, filter selection, and Escape work',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/#/shop');
 await expect(page.locator('#shopFiltersToggle')).toBeVisible();
 await page.locator('#shopFiltersToggle').click();
 await expect(page.locator('#shopFilterPanel')).toHaveClass(/is-open/);
 await expect(page.locator('#shopFilterShade')).not.toBeHidden();
 await page.keyboard.press('Escape');
 await expect(page.locator('#shopFilterPanel')).not.toHaveClass(/is-open/);
 await page.locator('#shopFiltersToggle').click();
 await page.locator('#filterCategory').selectOption('Legwork');
 await expect(page).toHaveURL(/category=Legwork/);
 await expect(page.locator('.shop-results-grid .lesson-card').first()).toBeVisible();
 await expect(page.locator('#shopFilterShade')).toBeHidden();
});

test('Classes remain within screen widths',async({page})=>{
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:850});
  await page.goto('/#/shop');
  const overflow=await page.evaluate(()=>Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth);
  expect(overflow,'Shop overflow at '+width).toBeLessThanOrEqual(2);
 }
});
