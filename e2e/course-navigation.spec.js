import {test,expect} from '@playwright/test';

const legwork={id:1,slug:'legwork-lab',title:'Legwork Lab',description:'Original flagship course.',price:16000,guru_price:36000};
const wave={id:99001,slug:'wave-lab',title:'Wave Lab',description:'Wave training.',price:12500,guru_price:25000};
const split={id:99002,slug:'split-lab',title:'Split Lab',description:'Split training.',price:9900,guru_price:19900};

test('Course navigation follows public catalog in every publication state',async({page})=>{
 let catalog=[legwork];
 await page.route('**/api/courses',route=>route.fulfill({json:{courses:catalog}}));
 await page.route('**/api/lessons',route=>route.fulfill({json:{lessons:[]}}));
 await page.route('**/api/bundles',route=>route.fulfill({json:{bundles:[]}}));
 const menu=page.locator('#coursesPopup');
 const cards=page.locator('.home-courses .home-program-grid a');
 const toggle=page.locator('#courseMenuToggle');
 await page.goto('/#/');
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toHaveAttribute('href','#/course');
 await expect(page.locator('.header-cta')).toHaveAttribute('href','#/course');
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(menu.locator('a[href="#/course"]')).toBeVisible();
 await expect(menu).not.toContainText('Wave Lab');
 await page.keyboard.press('Escape');
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect(menu).toBeHidden();

 // A publication becomes part of the next public catalog response.
 catalog=[split,legwork,wave];
 await page.reload();
 await expect(cards).toHaveCount(3);
 await expect(cards.first()).toHaveAttribute('href','#/course');
 await expect(cards.nth(1)).toHaveAttribute('href','#/course/wave-lab');
 await expect(cards.nth(2)).toHaveAttribute('href','#/course/split-lab');
 await expect(page.locator('.header-cta')).toHaveAttribute('href','#/courses');
 await toggle.click();
 await expect(menu.locator('a[href="#/course/wave-lab"]')).toBeVisible();
 await menu.locator('a[href="#/course/wave-lab"]').click();
 await expect(page.locator('#app h1')).toHaveText('Wave Lab');
 await expect(menu).toBeHidden();

 // Archived flagship disappears; the remaining public course becomes primary.
 catalog=[wave];
 await page.goto('/#/');
 await page.reload();
 await expect(cards).toHaveCount(1);
 await expect(cards.first()).toHaveAttribute('href','#/course/wave-lab');
 await expect(page.locator('.header-cta')).toHaveAttribute('href','#/course/wave-lab');
 await toggle.click();
 await expect(menu.locator('a[href="#/course"]')).toHaveCount(0);
 await expect(menu).not.toContainText('Legwork Lab');
 await expect(menu).not.toContainText('Split Lab');
 await page.keyboard.press('Escape');

 catalog=[];
 await page.reload();
 await expect(cards).toHaveCount(0);
 await expect(page.locator('.home-courses')).toContainText('No courses are on sale');
 await expect(page.locator('.header-cta')).toHaveAttribute('href','#/courses');
 await toggle.click();
 await expect(menu).toContainText('No courses on sale right now');
 await expect(menu.locator('a[href^="#/course/"]')).toHaveCount(0);
});

test('Mobile Spanish course menu is usable with multiple courses',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>localStorage.setItem('legwork_lang','es'));
 await page.route('**/api/courses',route=>route.fulfill({json:{courses:[legwork,wave,split]}}));
 await page.route('**/api/lessons',route=>route.fulfill({json:{lessons:[]}}));
 await page.goto('/#/');
 await expect(page.locator('.home-courses .home-program-grid a')).toHaveCount(3);
 await page.locator('#menuBtn').click();
 await page.locator('#courseMenuToggle').click();
 await expect(page.locator('#coursesPopup')).toContainText('Curso disponible');
 await expect(page.locator('#coursesPopup a[href="#/course/split-lab"]')).toBeVisible();
 await page.locator('#coursesPopup a[href="#/course/split-lab"]').click();
 await expect(page.locator('#app h1')).toHaveText('Split Lab');
 await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#coursesPopup')).toBeHidden();
});
