import {esPublic} from './es-public.js';
import {esAdmin} from './es-admin.js';
import {esErrors} from './es-errors.js';
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

// EN is the canonical stored content. ES applies to UI labels only;
// never translate underlying product IDs, URLs, prices or form values.
Object.assign(dictionary,esPublic,esAdmin,esErrors);
const sourceNodes=new WeakMap();
const sourceAttrs=new WeakMap();
const counts=[
 [/^(\d+) CLASSES FOUND$/,m=>m[1]+' CLASES ENCONTRADAS'],
 [/^(\d+) lessons completed$/,m=>m[1]+' clases completadas'],
 [/^(\d+) USERS$/,m=>m[1]+' USUARIOS'],
 [/^(\d+) PENDING$/,m=>m[1]+' PENDIENTES'],
 [/^(\d+) TO REVIEW$/,m=>m[1]+' POR REVISAR'],
 [/^Payment #(\d+)$/,m=>'Pago n.º '+m[1]],
 [/^Certificate issued on (\d{4}-\d{2}-\d{2})$/,m=>'Certificado emitido el '+m[1]],
 [/^Certificate ID: (.+)$/,m=>'Número de certificado: '+m[1]],
 [/^Completed: (\d+\/\d+) · Homework submitted: (\d+\/\d+) · Instructor approved: (\d+\/\d+)$/,m=>'Completadas: '+m[1]+' · Entregadas: '+m[2]+' · Aprobadas: '+m[3]],
 [/^Requirements incomplete: (\d+\/\d+) lessons approved$/,m=>'Requisitos incompletos: '+m[1]+' clases aprobadas']
];
export function translateText(value,lang='en'){
 const raw=String(value??'');
 if(lang!=='es')return raw;
 const trim=raw.trim(),start=raw.slice(0,raw.indexOf(trim)),end=raw.slice(raw.indexOf(trim)+trim.length);
 if(!trim)return raw;
 const exact=dictionary[trim];
 if(typeof exact==='string')return start+exact+end;
 const arrow=/^(.+?)(\s*[↗→↓✕▶])$/.exec(trim);
 if(arrow&&dictionary[arrow[1]])return start+dictionary[arrow[1]]+arrow[2]+end;
 for(const [pattern,format] of counts){const match=trim.match(pattern);if(match)return start+format(match)+end;}
 return raw;
}
export function translatePage(root,lang='en'){
 if(!root)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 let node;
 while((node=walker.nextNode())){
  if(!node.parentElement||node.parentElement.closest('[data-no-i18n],script,style,code,pre,textarea,[contenteditable="true"]'))continue;
  if(!sourceNodes.has(node))sourceNodes.set(node,node.nodeValue);
  node.nodeValue=translateText(sourceNodes.get(node),lang);
 }
 const attrs=['placeholder','title','aria-label'];
 root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(el=>{
  if(el.closest('[data-no-i18n]'))return;
  if(!sourceAttrs.has(el)){
   const originals={};
   for(const attr of attrs)if(el.hasAttribute(attr))originals[attr]=el.getAttribute(attr);
   sourceAttrs.set(el,originals);
  }
  for(const [key,original] of Object.entries(sourceAttrs.get(el)))el.setAttribute(key,translateText(original,lang));
 });
}
