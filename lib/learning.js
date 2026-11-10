/**
 * The student player API returns only the currently authorized video URL.
 * Syllabus rows never expose URLs for other lessons.
 */
export function registerLearningRoutes(app,db,{auth}){
  const access=db.prepare('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?');
  const single=db.prepare('SELECT 1 FROM lesson_access WHERE user_id=? AND lesson_id=?');
  const getLesson=db.prepare('SELECT l.*,c.title AS course_title,c.slug AS course_slug FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=? AND c.active=1');
  const syllabus=db.prepare("SELECT l.id,l.title,l.duration,l.sort_order,l.free,l.course_id,l.kind,l.level,p.completed,p.homework_url,r.feedback AS teacher_feedback FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? LEFT JOIN homework_reviews r ON r.lesson_id=l.id AND r.user_id=? WHERE l.course_id=? ORDER BY l.sort_order,l.id");
  const isAllowed=(u,l)=>u.role==='admin'||l.free===1||!!access.get(u.id,l.course_id)||!!single.get(u.id,l.id);
  app.get('/api/learning/:id',auth,(req,res)=>{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid lesson ID'});
    const l=getLesson.get(id);
    if(!l)return res.status(404).json({error:'Lesson not found'});
    if(!isAllowed(req.user,l))return res.status(403).json({error:'This lesson is not part of your library'});
    const items=syllabus.all(req.user.id,req.user.id,l.course_id).map(item=>({
      id:item.id,title:item.title,duration:item.duration,kind:item.kind,level:item.level,
      completed:item.completed===1,homework_url:item.homework_url||'',
      teacher_feedback:item.teacher_feedback||'',
      accessible:Boolean(isAllowed(req.user,item))
    }));
    const tier=db.prepare('SELECT tier FROM enrollments WHERE user_id=? AND course_id=?').get(req.user.id,l.course_id)?.tier||'none';
    const selected=items.find(item=>item.id===l.id);
    res.setHeader('Cache-Control','private, no-store');
    res.json({
      course:{id:l.course_id,slug:l.course_slug,title:l.course_title,tier},
      lesson:{id:l.id,title:l.title,category:l.category,kind:l.kind,level:l.level,duration:l.duration,
        equipment:l.equipment,tags:l.tags,focus:l.focus,video_url:l.video_url||null,
        completed:selected.completed,homework_url:selected.homework_url,teacher_feedback:selected.teacher_feedback},
      syllabus:items
    });
  });
}
