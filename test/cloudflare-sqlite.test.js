import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableSqlite } from '../cloudflare/sqlite-adapter.js';

function cursor(rows=[]) {
  let index=0;
  return {
    next() { return index>=rows.length?{done:true}:{done:false,value:rows[index++]}; },
    toArray() { const left=rows.slice(index); index=rows.length; return left; },
    one() { if(rows.length!==1)throw Error('Expected exactly one row');return rows[0]; },
  };
}
function fakeStorage() {
  const calls=[];
  let count=0;
  const storage={
    sql: {
      exec(statement,...args) {
        calls.push({statement,args});
        if(statement.includes('changes() AS changes'))return cursor([{changes:count,id:19}]);
        if(statement.includes('table_info'))return cursor([{name:'id'},{name:'email'}]);
        if(statement === 'PRAGMA foreign_keys')return cursor([{foreign_keys:1}]);
        if(statement==='SELECT * FROM users WHERE id=?')return cursor([{id:args[0],email:'a@example.org'}]);
        if(statement==='SELECT * FROM users')return cursor([{id:1},{id:2}]);
        if(statement.startsWith('UPDATE ')){count=2;return cursor();}
        return cursor();
      }
    },
    transactionSync(fn){calls.push({transaction:true});return fn();},
  };
  return {storage,calls};
}
test('prepared reads, writes, and positional parameters match LEGWORK contracts',()=>{
  const {storage,calls}=fakeStorage();
  const db=createDurableSqlite(storage);
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get(7),{id:7,email:'a@example.org'});
  assert.deepEqual(db.prepare('SELECT * FROM users').all(),[{id:1},{id:2}]);
  assert.deepEqual(db.prepare('UPDATE users SET email=? WHERE id=?').run('new@example.org',7),{changes:2,lastInsertRowid:19});
  assert.deepEqual(calls[0].args,[7]);
  assert.deepEqual(calls[2].args,['new@example.org',7]);
});
test('migration pragma whitelist and better-sqlite3 wrapper transaction',()=>{
  const {storage,calls}=fakeStorage();
  const db=createDurableSqlite(storage);
  assert.deepEqual(db.pragma('table_info(users)'),[{name:'id'},{name:'email'}]);
  assert.deepEqual(db.pragma('journal_mode=WAL'),[]);
  assert.deepEqual(db.pragma('foreign_keys=ON'),[]);
  assert.throws(()=>db.pragma('writable_schema=ON'),/Unsupported/);
  const txn=db.transaction((id)=>db.prepare('SELECT * FROM users WHERE id=?').get(id));
  assert.equal(txn(11).id,11);
  assert.ok(calls.some(call=>call.transaction===true));
});
test('invalid storage and statement types are rejected',()=>{
  assert.throws(()=>createDurableSqlite({}),/SQLite-backed/);
  const db=createDurableSqlite(fakeStorage().storage);
  assert.throws(()=>db.prepare(''),/SQL statement/);
  assert.throws(()=>db.prepare('SELECT 1').run(),/write statement/);
});
