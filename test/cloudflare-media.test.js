import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeWebp } from '../cloudflare/webp.js';
import { registerImageUploads } from '../cloudflare/image-upload.js';

// A tiny real WebP produced by a standards-compliant image encoder.
const fixture = Buffer.from('UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAUAiJaACdLoB+AADsAD+899n/n5nduL+q3/7DP+vMvrzL/sFgAA=', 'base64');
const response = () => ({
  statusCode: 200, payload: null,
  status(code) { this.statusCode = code; return this; },
  set() { return this; },
  json(payload) { this.payload = payload; return this; },
  end() { return this; },
  send(payload) { this.payload = payload; return this; },
});

test('only metadata-free single-frame WebP files are accepted', () => {
  assert.equal(isSafeWebp(fixture), true);
  const bad = Buffer.from(fixture);
  bad[0] = 0;
  assert.equal(isSafeWebp(bad), false);
  assert.equal(isSafeWebp(fixture, 24), false);
  assert.equal(isSafeWebp(Buffer.concat([fixture, Buffer.alloc(8)])), false);
  const tags = Buffer.from(fixture);
  tags.write('EXIF', 12, 4, 'ascii');
  assert.equal(isSafeWebp(tags), false);
});

test('image storage uses only SQLite Durable Object KV and keeps unassigned media private', () => {
  const kvMap = new Map();
  const images = {
    put(key, value) { kvMap.set(key, value); },
    get(key) { return kvMap.get(key); },
    delete(key) { return kvMap.delete(key); },
  };
  const records = new Map();
  const assigned = new Set();
  const db = {
    exec() {},
    transaction(fn) { return () => fn(); },
    prepare(sql) {
      if (sql.includes('SELECT name FROM uploaded_images')) return { all: () => [] };
      if (sql.includes('COALESCE(SUM(bytes)')) return { get: () => ({ size: [...records.values()].reduce((v, x) => v + x.bytes, 0) }) };
      if (sql.includes('INSERT INTO uploaded_images')) return { run(name, time, bytes) { records.set(name, { time, bytes }); return { changes: 1 }; } };
      if (sql.includes('SELECT 1 FROM site_media')) return { get(url) { return assigned.has(url) ? { 1: 1 } : undefined; } };
      throw Error('Unexpected SQL in media unit test: ' + sql);
    },
  };
  const routes = {};
  const app = {
    post(path, ...handlers) { routes[path] = handlers.at(-1); },
    get(path, ...handlers) { routes[path] = handlers.at(-1); },
  };
  registerImageUploads(app, db, { auth:()=>{}, admin:()=>{}, ctx:{storage:{kv:images}} });
  const uploaded = response();
  routes['/api/admin/image-upload']({
    headers: { 'content-type':'image/webp' }, body: fixture,
  }, uploaded);
  assert.equal(uploaded.statusCode, 201);
  assert.match(uploaded.payload.url, /^\/media\/[a-f0-9-]+\.webp$/);
  const name = uploaded.payload.url.slice('/media/'.length);
  assert.equal(kvMap.size, 1);

  const hidden = response();
  routes['/media/:name']({params:{name}}, hidden);
  assert.equal(hidden.statusCode, 404);

  assigned.add(uploaded.payload.url);
  const visible = response();
  routes['/media/:name']({params:{name}}, visible);
  assert.equal(visible.statusCode, 200);
  assert.ok(Buffer.isBuffer(visible.payload));
  assert.deepEqual(visible.payload, fixture);
});

test('Cloudflare upload rejects other MIME types, even with WebP bytes', () => {
  const routes = {};
  const app = { post(path, ...handlers) { routes[path] = handlers.at(-1); }, get() {} };
  const db = { exec() {} };
  registerImageUploads(app, db, {auth:()=>{},admin:()=>{},ctx:{storage:{kv:{}}}});
  const res = response();
  routes['/api/admin/image-upload']({headers:{'content-type':'image/png'}, body:fixture},res);
  assert.equal(res.statusCode,415);
});
