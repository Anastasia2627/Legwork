import {test,expect} from '@playwright/test';

test('Reference system uses bold condensed typography, true red CTAs and grayscale surfaces',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 await page.goto('/#/');
 const design=await page.evaluate(()=>{
  const css=s=>getComputedStyle(document.querySelector(s));
  return {
   font:css('.home-hero h1').fontFamily,
   header:css('.header').backgroundColor,
   cta:css('.header-cta').backgroundColor,
   heading:css('.home-hero h1').textTransform,
   body:getComputedStyle(document.body).backgroundColor
  };
 });
 expect(design.font).toContain('Barlow Condensed');
 expect(design.header).toBe('rgb(255, 255, 255)');
 expect(design.cta).toBe('rgb(208, 6, 53)');
 expect(design.heading).toBe('uppercase');
 expect(design.body).toBe('rgb(255, 255, 255)');
 await expect(page.locator('.home-program-primary')).toContainText('LEGWORK');
 await expect(page.locator('.home-program-primary')).toContainText('BOSS');
 await expect(page.locator('.home-program-link')).toHaveCount(2);
 await expect(page.locator('.home-program-link')).toContainText(['WAVE LIKE A BOSS','SPLIT LIKE A BOSS']);
 await expect(page.locator('.home-program-link a')).toHaveCount(0);
});

test('Courses menu distinguishes a published course from future courses',async({page})=>{
 await page.goto('/#/');
 if(await page.locator('#menuBtn').isVisible()){
  await page.locator('#menuBtn').click();
  await expect(page.locator('#nav')).toHaveClass(/open/);
 }
 const toggle=page.locator('#courseMenuToggle');
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#coursesPopup')).toBeVisible();
 await expect(page.locator('#coursesPopup a[href="#/course"]')).toHaveCount(1);
 await expect(page.locator('#coursesPopup')).toContainText('Coming soon');
 await page.locator('#coursesPopup a').click();
 await expect(page).toHaveURL(/#\/course/);
});

test('Course program offers four cards per desktop row and a real carousel mode',async({page})=>{
 await page.setViewportSize({width:1280,height:850});
 await page.goto('/#/course');
 await expect(page.locator('.course-identity')).toContainText('LEGWORK LIKE A BOSS');
 const cards=page.locator('.course-program-card');
 expect(await cards.count()).toBeGreaterThan(0);
 const layout=await page.locator('#courseProgramGrid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 expect(layout).toBe(4);
 await page.locator('[data-program-mode="carousel"]').click();
 await expect(page.locator('#courseProgramGrid')).toHaveClass(/is-carousel/);
 await expect(page.locator('[data-program-mode="carousel"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-program-mode="grid"]').click();
 await expect(page.locator('#courseProgramGrid')).not.toHaveClass(/is-carousel/);
});

test('Mentorship follows the four-step reference, shows Deep questionnaire, does not imply live payment',async({page})=>{
 await page.goto('/#/mentorship');
 await expect(page.locator('.ref-prices .price-card')).toHaveCount(2);
 await expect(page.locator('.mentor-request-stages span')).toHaveCount(4);
 await expect(page.locator('#deepFields')).toHaveClass(/hidden/);
 await page.locator('.mentor-plan-toggle [data-package="Deep"]').click();
 await expect(page.locator('#mentorshipPackage')).toHaveValue('Deep');
 await expect(page.locator('#deepFields')).not.toHaveClass(/hidden/);
 await expect(page.locator('#mentorshipForm')).toContainText('Direct file upload is not available yet');
 await expect(page.locator('#mentorshipForm')).toContainText('does not charge you');
});

test('Shop individual class has an actual detail template without leaking private video URLs',async({page})=>{
 await page.goto('/#/lesson/1');
 await expect(page.locator('.lesson-breadcrumbs')).toContainText('Classes');
 await expect(page.locator('.lesson-detail-purchase h1')).toBeVisible();
 await expect(page.locator('[data-watch="1"]')).toHaveCount(1);
 await expect(page.locator('.lesson-details-list>div')).toHaveCount(4);
 expect(await page.locator('.lesson-detail').textContent()).not.toContain('youtube.com/watch');
});

test('Reference pages are responsive without horizontal scrolling',async({page})=>{
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:860});
  for(const route of ['/#/','/#/course','/#/shop','/#/mentorship','/#/lesson/1']){
   await page.goto(route);
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)}));
   expect(dimensions.scroll,route+' at '+width).toBeLessThanOrEqual(dimensions.width+2);
  }
 }
});
