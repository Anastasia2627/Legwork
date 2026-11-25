/**
 * The student's accessible learning progress. Pure functions keep the UI
 * honest when individual lessons and full-course enrollments coexist.
 * The server remains the sole authority for real lesson/video access.
 */
const completed = value => value === true || value === 1;

export function accessibleLessons(lessons, dashboard, role='student') {
 const courseIds = new Set((dashboard?.enrollments||[]).map(c=>Number(c.id)));
 const individualIds = new Set((dashboard?.lessonAccess||[]).map(Number));
 return (Array.isArray(lessons)?lessons:[]).filter(l=>
  role==='admin'||completed(l.free)||courseIds.has(Number(l.course_id))||individualIds.has(Number(l.id))
 );
}

export function learningProgress(lessons, progress) {
 const selected=Array.isArray(lessons)?lessons:[];
 const completeIds = new Set((Array.isArray(progress)?progress:[])
  .filter(row=>completed(row.completed)).map(row=>Number(row.lesson_id)));
 const finished=selected.filter(l=>completeIds.has(Number(l.id))).length;
 const total=selected.length;
 return {
  completed:finished,
  total,
  percent:total?Math.min(100,Math.round(finished/total*100)):0,
  next:selected.find(l=>!completeIds.has(Number(l.id)))||selected[0]||null
 };
}

export function courseLearningProgress(courseId, allLessons, progress) {
 return learningProgress(
  (Array.isArray(allLessons)?allLessons:[]).filter(l=>Number(l.course_id)===Number(courseId)),
  progress
 );
}
