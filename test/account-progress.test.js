import test from 'node:test';
import assert from 'node:assert/strict';
import {accessibleLessons,learningProgress,courseLearningProgress} from '../public/account-progress.js';

const library=[
 {id:1,course_id:10,title:'Free introduction',free:1},
 {id:2,course_id:10,title:'Course one',free:0},
 {id:3,course_id:10,title:'Course two',free:0},
 {id:4,course_id:20,title:'Other course one',free:0},
 {id:5,course_id:20,title:'Other course two',free:0},
];
test('student dashboard shows only free, purchased and enrolled lessons',()=>{
 const dashboard={enrollments:[{id:10,tier:'self'}],lessonAccess:[5]};
 assert.deepEqual(accessibleLessons(library,dashboard).map(l=>l.id),[1,2,3,5]);
 assert.deepEqual(accessibleLessons(library,{enrollments:[],lessonAccess:[]}).map(l=>l.id),[1]);
 assert.deepEqual(accessibleLessons(library,dashboard,'admin').map(l=>l.id),[1,2,3,4,5]);
});
test('overall progress excludes inaccessible completion records and stays in 0-100 range',()=>{
 const progress=[{lesson_id:1,completed:1},{lesson_id:4,completed:1},{lesson_id:2,completed:0}];
 const accessible=accessibleLessons(library,{enrollments:[{id:10}],lessonAccess:[]});
 assert.deepEqual(learningProgress(accessible,progress),{
  completed:1,total:3,percent:33,next:library[1]
 });
 const paid=accessibleLessons(library,{enrollments:[],lessonAccess:[]});
 assert.equal(learningProgress(paid,progress).percent,100);
});
test('two courses do not inherit the same overall progress',()=>{
 const rows=[{lesson_id:1,completed:true},{lesson_id:2,completed:1},{lesson_id:4,completed:true}];
 assert.deepEqual(courseLearningProgress(10,library,rows),{completed:2,total:3,percent:67,next:library[2]});
 assert.deepEqual(courseLearningProgress(20,library,rows),{completed:1,total:2,percent:50,next:library[4]});
});
test('missing lessons and progress, finished lessons and stale duplicate rows behave safely',()=>{
 assert.deepEqual(learningProgress(null,null),{completed:0,total:0,percent:0,next:null});
 assert.deepEqual(learningProgress(library.slice(0,2),[
  {lesson_id:1,completed:1},{lesson_id:1,completed:1},{lesson_id:2,completed:1}
 ]),{completed:2,total:2,percent:100,next:library[0]});
 assert.equal(courseLearningProgress(999,library,[]).percent,0);
});
