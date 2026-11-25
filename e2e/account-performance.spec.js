import {test,expect} from '@playwright/test';

test('Account tabs fetch only their required data and recover from failure',async({page})=>{
 const calls=[];
 let failProfile=false;
 const user={id:99099,name:'Performance student',role:'student',email:'perf@example.org'};
 await page.route('**/api/me',route=>route.fulfill({json:{user}}));
 const model={
  '/api/dashboard':{enrollments:[],lessonAccess:[],progress:[],mentorships:[],orders:[]},
  '/api/account/achievements':{streak:0,badges:[],completed:0},
  '/api/account/homework-reviews':{reviews:[]},
  '/api/payments/config':{enabled:false},
  '/api/payments/mine':{payments:[]},
  '/api/account/email-status':{verified:true,verification_required:false},
  '/api/account/certificates':{certificates:[]},
  '/api/account/deletion-request':{request:null},
  '/api/account/sessions':{active_sessions:1,max_sessions:4}
 };
 for(const [path,data] of Object.entries(model))await page.route('**'+path,route=>{
  calls.push(path);
  if(failProfile&&path==='/api/account/sessions')return route.fulfill({status:503,json:{error:'Unavailable for test'}});
  return route.fulfill({json:data});
 });
 await page.goto('/#/account');
 await expect(page.locator('.account-continue')).toBeVisible();
 expect(calls).toHaveLength(7);
 expect(calls).not.toContain('/api/account/deletion-request');
 calls.length=0;
 await page.locator('.cabinet-nav [data-tab="lessons"]').click();
 await expect(page.locator('#studentLibraryMount')).toBeVisible();
 expect(calls).toEqual(['/api/dashboard']);
 calls.length=0;
 await page.locator('[data-library-filter="done"]').click();
 expect(calls).toEqual([]);
 await page.locator('.cabinet-nav [data-tab="profile"]').click();
 await expect(page.locator('#profileForm')).toBeVisible();
 expect(calls.sort()).toEqual(['/api/account/deletion-request','/api/account/sessions']);
 failProfile=true;
 await page.locator('.cabinet-nav [data-tab="profile"]').click();
 await expect(page.locator('.cabinet-main [role="alert"]')).toBeVisible();
 failProfile=false;
 await page.locator('.cabinet-main [data-tab="profile"]').click();
 await expect(page.locator('#profileForm')).toBeVisible();
});
