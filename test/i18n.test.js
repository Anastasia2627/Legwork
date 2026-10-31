import {test} from 'node:test';
import assert from 'node:assert/strict';
import {translateText} from '../public/i18n.js';

test('EN/ES language function preserves source labels, numbers and stable values',()=>{
 assert.equal(translateText('LOGIN','en'),'LOGIN');
 assert.equal(translateText('ADD TO BAG','es'),'AÑADIR A LA CESTA');
 assert.equal(translateText('  REQUEST PURCHASE  ','es'),'  SOLICITAR COMPRA  ');
 assert.equal(translateText('15 CLASSES FOUND','es'),'15 CLASES ENCONTRADAS');
 assert.equal(translateText('3 lessons completed','es'),'3 clases completadas');
 assert.equal(translateText('Payment #42','es'),'Pago n.º 42');
 assert.equal(translateText('Level','es'),'Nivel');
 assert.equal(translateText('Invalid credentials','es'),'Credenciales incorrectas');
 assert.equal(translateText('Certificate ID: abc-123','es'),'Número de certificado: abc-123');
 assert.equal(translateText('An unexpected teacher-written remark','es'),'An unexpected teacher-written remark');
 assert.equal(translateText('Clases personalizadas','en'),'Clases personalizadas');
});
