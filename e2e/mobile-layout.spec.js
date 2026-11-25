import {test,expect} from '@playwright/test';

const course={id:1,slug:'legwork-lab',title:'Legwork Lab',description:'Learn legwork.',price:16000,guru_price:36000};
const lessons=[{id:1,course_id:1,title:'Free introduction',free:1,price:0,category:'Warm-up',kind:'Warm-up',level:'Beginner',duration:12,sort_order:1},{id:2,course_id:1,title:'Practice a long lesson title with multiple techniques',free:0,price:1599,category:'Legwork',kind:'Element',level:'Intermediate',duration:14,sort_order:2}];
async function setup(page){
 await page.route('**/api/courses',r=>r.fulfill({json:{courses:[course]}}));
 await page.route('**/api/lessons',r=>r.fulfill({json:{lessons}}));
 await page.route('**/api/bundles',r=>r.fulfill({json:{bundles:[]}}));
 await page.route('**/api/me',r=>r.fulfill({json:{user:null}}));
 await page.route('**/api/media',r=>r.fulfill({json:{assets:{}}}));
 await page.route('**/api/mentorship/offers',r=>r.fulfill({json:{offers:[]}}));
}
async function fits(page){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}
for(const width of [320,390,768]){
 test('Public pages fit '+width+'px viewport',async({page})=>{
  await page.setViewportSize({width,height:820});
  await setup(page);
  for(const route of ['','courses','course','shop','lesson/2','mentorship','login','forgot-password']){
   await page.goto('/#/'+route);
   await expect(page.locator('#app .loading')).toHaveCount(0);
   await expect(page.locator('#app')).not.toContainText('Unable to load');
   await fits(page);
  }
 });
}
test('Mobile cart and filters isolate focus and release background on close and resize',async({page})=>{
 await page.setViewportSize({width:390,height:820});
 await setup(page);
 await page.goto('/#/shop');
 await expect(page.locator('#shopFiltersToggle')).toBeVisible();
 await page.locator('#shopFiltersToggle').click();
 const panel=page.locator('#shopFilterPanel');
 await expect(panel).toHaveAttribute('aria-modal','true');
 await expect(page.locator('.shop-catalog')).toHaveAttribute('inert','');
 await expect(page.locator('#shopFiltersClose')).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 expect(await page.evaluate(()=>document.querySelector('#shopFilterPanel').contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');
 await expect(page.locator('#shopFiltersToggle')).toBeFocused();
 await expect(page.locator('.shop-catalog')).not.toHaveAttribute('inert','');
 await page.locator('#cartBtn').click();
 await expect(page.locator('#cartDrawer')).toHaveClass(/open/);
 await expect(page.locator('#app')).toHaveAttribute('inert','');
 await page.keyboard.press('Escape');
 await expect(page.locator('#cartBtn')).toBeFocused();
 await expect(page.locator('#app')).not.toHaveAttribute('inert','');
 await page.locator('#shopFiltersToggle').click();
 await page.setViewportSize({width:1200,height:820});
 await expect(panel).not.toHaveClass(/is-open/);
 await expect(page.locator('.shop-catalog')).not.toHaveAttribute('inert','');
});
