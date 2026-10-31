import {test,expect} from '@playwright/test';

test('Skip to content, mobile menu and Escape maintain keyboard focus',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 await page.goto('/#/course');
 await expect(page.locator('h1').first()).toBeVisible();
 const before=page.url();
 await page.locator('.skip-link').focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('#app')).toBeFocused();
 expect(page.url()).toBe(before);
 const menu=page.locator('#menuBtn');
 await menu.click();
 await expect(menu).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#nav')).toHaveClass(/open/);
 await page.keyboard.press('Escape');
 await expect(menu).toHaveAttribute('aria-expanded','false');
 await expect(menu).toBeFocused();
 await menu.click();
 await page.locator('#nav a[href="#/shop"]').click();
 await expect(page).toHaveURL(/#\/shop/);
 await expect(menu).toHaveAttribute('aria-expanded','false');
});

test('Cart dialog traps Tab, supports Escape, then restores focus',async({page})=>{
 await page.goto('/#/shop');
 const cart=page.locator('#cartBtn'),drawer=page.locator('#cartDrawer'),close=page.locator('#closeCart');
 await expect(drawer).toHaveJSProperty('inert',true);
 await cart.focus();await cart.press('Enter');
 await expect(drawer).toHaveClass(/open/);
 await expect(drawer).toHaveJSProperty('inert',false);
 await expect(cart).toHaveAttribute('aria-expanded','true');
 await expect(close).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(close).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(drawer).not.toHaveClass(/open/);
 await expect(drawer).toHaveJSProperty('inert',true);
 await expect(cart).toBeFocused();
 await expect(cart).toHaveAttribute('aria-expanded','false');
});

test('Public pages remain within narrow and wide browser viewports',async({page})=>{
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:830});
  for(const route of ['/#/','/course','/shop','/mentorship']){
   await page.goto(route);
   await expect(page.locator('h1').first()).toBeVisible();
   const dimensions=await page.evaluate(()=>({screen:window.innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
   expect(dimensions.html,route+' at '+width).toBeLessThanOrEqual(dimensions.screen+2);
   expect(dimensions.body,route+' at '+width).toBeLessThanOrEqual(dimensions.screen+2);
  }
 }
});
