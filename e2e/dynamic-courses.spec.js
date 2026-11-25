import {test,expect} from '@playwright/test';

const course={id:99001,slug:'wave-lab',title:'Wave Lab Test',description:'A distinct wave training description.',price:12999,guru_price:27950};
const sample=[
 {id:99002,course_id:99001,title:'Wave second',sort_order:2,duration:15,level:'Intermediate',category:'Waving',kind:'Element',free:0,price:1500,cover_url:''},
 {id:99001,course_id:99001,title:'Wave first',sort_order:1,duration:10,level:'Beginner',category:'Waving',kind:'Element',free:1,price:0,cover_url:''}
];
test('Dynamic course uses only its own published program, exact prices and course ID',async({page})=>{
 await page.route('**/api/courses',async route=>{
  const response=await route.fetch(),json=await response.json();
  await route.fulfill({response,json:{...json,courses:[...json.courses,course]}});
 });
 await page.route('**/api/lessons',async route=>{
  const response=await route.fetch(),json=await response.json();
  await route.fulfill({response,json:{...json,lessons:[...json.lessons,...sample]}});
 });
 await page.route('**/api/me',route=>route.fulfill({json:{user:{id:99999,name:'Test student',role:'student'}}}));
 await page.route('**/api/orders',route=>route.fulfill({status:409,json:{error:'Test request intercepted; no real order created'}}));
 await page.goto('/#/courses');
 await expect(page.getByRole('link',{name:course.title,exact:true})).toBeVisible();
 await page.getByRole('link',{name:course.title,exact:true}).click();
 await expect(page).toHaveURL(/#\/course\/wave-lab$/);
 await expect(page.locator('#app h1')).toHaveText(course.title);
 await expect(page).toHaveTitle('Wave Lab Test | Legwork');
 await expect(page.locator('#app')).toContainText(course.description);
 const tiles=page.locator('#courseProgramGrid .course-program-card');
 await expect(tiles).toHaveCount(2);
 await expect(tiles.nth(0)).toContainText('Wave first');
 await expect(tiles.nth(1)).toContainText('Wave second');
 await expect(page.locator('.course-hero-actions a[href="#/lesson/99001"]')).toBeVisible();
 await expect(page.locator('#prices')).toContainText('$129.99');
 await expect(page.locator('#prices')).toContainText('$279.50');
 await page.locator('.course-hero-actions a[href$="#prices"]').click();
 await expect(page).toHaveURL(/#prices$/);
 const purchase=page.waitForRequest(req=>req.url().endsWith('/api/orders')&&req.method()==='POST');
 await page.locator('#prices button[data-plan="guru"]').click();
 expect((await purchase).postDataJSON()).toEqual({kind:'course',item_id:course.id,plan:'guru'});
 await page.goto('/#/lesson/99001');
 await expect(page.locator('.lesson-related-course a')).toHaveAttribute('href','#/course/wave-lab');
 await page.goto('/#/course/not-a-published-course');
 await expect(page.locator('#app')).toContainText('Course not available');
 await expect(page.locator('#app button[data-order]')).toHaveCount(0);
 await page.goto('/#/course');
 await expect(page.locator('.course-identity')).toBeVisible();
});
