/**
 * Spanish UI glossary for the editorial/commerce interface.
 * Lesson content and uploaded materials require editor-provided translations.
 */
const dictionary = {
'About':'Sobre mí','Courses':'Cursos','Classes':'Clases','Mentorship':'Mentoría',
'Get started':'Empezar','Log in':'Iniciar sesión','My account':'Mi cuenta',
'Your bag':'Tu cesta','BAG':'CESTA','MY STORY':'MI HISTORIA',
'WHY LEARN WITH ME?':'¿POR QUÉ APRENDER CONMIGO?','FIND YOUR MOVEMENT':'ENCUENTRA TU MOVIMIENTO',
'BEYOND THE STUDIO':'MÁS ALLÁ DEL ESTUDIO','READY TO BEGIN?':'¿LISTA PARA EMPEZAR?',
'YOUR MOVEMENT. YOUR RULES.':'TU MOVIMIENTO. TUS REGLAS.',
'EXPLORE COURSES':'EXPLORAR CURSOS','FROM FIRST STEPS TO SIGNATURE STYLE':'DE LOS PRIMEROS PASOS A TU ESTILO',
'THE METHOD':'EL MÉTODO','THE BEGINNING':'EL COMIENZO',
'MADE FOR EVERY STAGE':'PARA TODOS LOS NIVELES','WHO IS IT FOR?':'¿PARA QUIÉN ES?',
'WHAT YOU WILL LEARN':'QUÉ APRENDERÁS','ONE STEP AT A TIME':'PASO A PASO',
'HOW IT WORKS':'CÓMO FUNCIONA','YOUR COURSE PROGRAM':'PROGRAMA DEL CURSO',
'CURRICULUM':'PLAN DE ESTUDIOS','TRY YOUR FIRST LESSON':'PRUEBA TU PRIMERA CLASE',
'FIRST STEP':'PRIMER PASO','CHOOSE YOUR PATH':'ELIGE TU CAMINO',
'PROGRAM OPTIONS':'OPCIONES DEL PROGRAMA','WITH FEEDBACK':'CON COMENTARIOS',
'REQUEST ACCESS':'SOLICITAR ACCESO','COMMON QUESTIONS':'PREGUNTAS FRECUENTES',
'BE THE BOSS OF YOUR MOVEMENT.':'DOMINA TU PROPIO MOVIMIENTO.',
'JOIN LEGWORK LAB':'UNIRME A LEGWORK LAB','WATCH FREE LESSON':'VER CLASE GRATUITA',
'TRY FREE LESSON':'PROBAR CLASE GRATIS','FREE CLASS':'CLASE GRATIS',
'START NOW':'EMPEZAR AHORA','FREE LESSON':'CLASE GRATIS',
'MY COURSES':'MIS CURSOS','MY ORDERS':'MIS PEDIDOS','MY LESSONS':'MIS CLASES',
'YOUR ACHIEVEMENTS':'TUS LOGROS','YOUR NEXT MOVE':'TU SIGUIENTE PASO',
'YOUR MOVEMENT LIBRARY':'TU BIBLIOTECA DE MOVIMIENTO',
'Learn only what you need, right now.':'Aprende solo lo que necesitas ahora.',
'Directions':'Categorías','Direction':'Categoría','Type':'Tipo','Level':'Nivel',
'All directions':'Todas las categorías','All types':'Todos los tipos','All levels':'Todos los niveles',
'ADD TO BAG':'AÑADIR A LA CESTA','VIEW':'VER','VIEW LESSON':'VER CLASE',
'WANT IT ALL? GET THE FULL COURSE.':'¿LO QUIERES TODO? ELIGE EL CURSO COMPLETO.',
'SEE LEGWORK LAB':'VER LEGWORK LAB',
'PART OF LEGWORK LAB':'PARTE DE LEGWORK LAB','EXPLORE THE COURSE':'EXPLORAR EL CURSO',
'LEARN · MOVE · REPEAT':'APRENDE · MUÉVETE · REPITE',
'WATCH LESSON':'VER CLASE','MARK AS COMPLETED':'MARCAR COMO COMPLETADA',
'Your bag is empty.':'Tu cesta está vacía.','REMOVE':'QUITAR',
'REQUEST PURCHASE':'SOLICITAR COMPRA','Total:':'Total:',
'GET MENTORSHIP':'SOLICITAR MENTORÍA','MEET YOUR MENTOR':'CONOCE A TU MENTORA',
'CHOOSE YOUR LEVEL OF FEEDBACK':'ELIGE TU TIPO DE ASESORÍA',
'CHOOSE BASIC':'ELEGIR BASIC','CHOOSE DEEP':'ELEGIR DEEP',
'YOUR VIDEO. YOUR NEXT LEVEL.':'TU VÍDEO. TU PRÓXIMO NIVEL.',
'REQUEST YOUR REVIEW':'SOLICITA TU ANÁLISIS',
'SUBMIT REQUEST':'ENVIAR SOLICITUD','QUESTIONS?':'¿PREGUNTAS?',
'WELCOME BACK':'BIENVENIDA DE NUEVO','CREATE AN ACCOUNT':'CREAR UNA CUENTA',
'SIGN UP':'REGISTRARSE','LOG IN':'INICIAR SESIÓN',
'CONTINUE LEARNING':'SEGUIR APRENDIENDO','CONTINUE':'CONTINUAR',
'MY VIDEO REVIEWS':'MIS ANÁLISIS DE VÍDEO','HOMEWORK FEEDBACK':'COMENTARIOS SOBRE TAREAS',
'YOUR ACHIEVEMENTS':'TUS LOGROS','BADGE COLLECTION':'COLECCIÓN DE INSIGNIAS',
'CERTIFICATE ELIGIBILITY':'REQUISITOS DEL CERTIFICADO',
'PROFILE':'PERFIL','CHANGE PASSWORD':'CAMBIAR CONTRASEÑA',
'SAVE PROFILE':'GUARDAR PERFIL','LOG OUT':'CERRAR SESIÓN',
'Current password':'Contraseña actual','New password (12+ characters)':'Nueva contraseña (12+ caracteres)',
'Your name':'Tu nombre','Instagram username':'Usuario de Instagram','Email':'Correo electrónico',
'SHOP':'TIENDA','ACTIVE':'ACTIVO','SOON':'PRÓXIMAMENTE',
'Free':'Gratis','Beginner':'Principiante','Intermediate':'Intermedio','Advanced':'Avanzado',
'Warm-up':'Calentamiento','Floor work':'Trabajo de suelo','Element':'Elemento',
'Your email':'Tu correo electrónico','JOIN WAITLIST':'UNIRME A LA LISTA',
'Buy lessons':'Comprar clases'
};
export function translatePage(root,lang){
 if(!root||lang!=='es')return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;while((node=walker.nextNode())){
  const raw=node.nodeValue,trimmed=raw.trim();
  const suffix=trimmed.endsWith(' ↗')?' ↗':'';
  const key=suffix?trimmed.slice(0,-suffix.length):trimmed;
  const value=dictionary[key];
  if(value){const lead=raw.match(/^\s*/)?.[0]||'',tail=raw.match(/\s*$/)?.[0]||'';node.nodeValue=lead+value+suffix+tail;}
 }
 root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{
  if(dictionary[el.placeholder])el.placeholder=dictionary[el.placeholder];
 });
}