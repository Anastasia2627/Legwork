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

/** Prioritize unfinished purchased/enrolled lessons over public previews.
 * Within each course, keep the saved syllabus order. Never call a completed
 * lesson "next"; callers can explicitly offer a revisit instead.
 */
export function studentLearningModel(lessons,dashboard,role='student'){
 const accessible=accessibleLessons(lessons,dashboard,role);
 const enrollments=new Map((dashboard?.enrollments||[]).map(c=>[Number(c.id),c]));
 const singles=new Set((dashboard?.lessonAccess||[]).map(Number));
 const progress=new Map((dashboard?.progress||[]).map(row=>[Number(row.lesson_id),row]));
 const groups=new Map();
 for(const lesson of accessible){
  const id=Number(lesson.course_id);
  if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push(lesson);
 }
 const ordered=[...groups.values()].flatMap(rows=>rows.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||Number(a.id)-Number(b.id)));
 const purchased=ordered.filter(l=>enrollments.has(Number(l.course_id))||singles.has(Number(l.id)));
 const previews=ordered.filter(l=>!purchased.includes(l));
 const isDone=l=>completed(progress.get(Number(l.id))?.completed);
 const unfinished=[...purchased,...previews].find(l=>!isDone(l))||null;
 return {ordered,purchased,previews,unfinished,revisit:unfinished?null:(purchased[0]||ordered[0]||null),progress,groups,enrollments};
}
