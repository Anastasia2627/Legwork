import crypto from 'node:crypto';
import express from 'express';
import { isSafeWebp } from './webp.js';

// Media lives in the SAME free SQLite-backed Durable Object as the school.
// No R2 bucket, Cloudflare Images subscription, or card is needed.
const NAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
const INTERNAL_URL = /^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
const MAX_OUTPUT = 2 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const KEY_PREFIX = 'public-image:';
export const safePublicImageUrl = (url, externalCheck) => INTERNAL_URL.test(url) || externalCheck(url);

export function registerImageUploads(app, db, { auth, admin, ctx }) {
  if (!ctx?.storage?.kv) throw Error('SQLite-backed Durable Object key-value storage is required');
  const images = ctx.storage.kv;
  db.exec('CREATE TABLE IF NOT EXISTS uploaded_images(name TEXT PRIMARY KEY, uploaded_at INTEGER NOT NULL, bytes INTEGER NOT NULL)');

  // Expire unused admin uploads after 48 hours. No scheduled billing services.
  const cleanupOrphans = () => {
    const stale = db.prepare(
      'SELECT name FROM uploaded_images WHERE uploaded_at<? AND NOT EXISTS ' +
      "(SELECT 1 FROM site_media WHERE url='/media/'||uploaded_images.name) AND NOT EXISTS " +
      "(SELECT 1 FROM lessons WHERE cover_url='/media/'||uploaded_images.name) LIMIT 40"
    ).all(Date.now() - 48 * 3600_000);
    for (const row of stale) {
      db.transaction(() => {
        images.delete(KEY_PREFIX + row.name);
        db.prepare('DELETE FROM uploaded_images WHERE name=?').run(row.name);
      })();
    }
  };

  const receive = express.raw({ type: () => true, limit: MAX_OUTPUT });
  app.post('/api/admin/image-upload', auth, admin, receive, (req, res) => {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (mime !== 'image/webp') {
      return res.status(415).json({ error: 'Please use a WebP image. The admin uploader converts JPEG/PNG automatically.' });
    }
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || !isSafeWebp(bytes, MAX_OUTPUT)) {
      return res.status(422).json({ error: 'Invalid WebP, metadata, or file larger than 2 MB' });
    }
    try {
      cleanupOrphans();
      const total = db.prepare('SELECT COALESCE(SUM(bytes),0) AS size FROM uploaded_images').get().size;
      if (total + bytes.byteLength > MAX_TOTAL) {
        return res.status(413).json({ error: 'School image storage is full (100 MB limit)' });
      }
      const name = crypto.randomUUID() + '.webp';
      const array = Uint8Array.from(bytes).buffer;
      db.transaction(() => {
        images.put(KEY_PREFIX + name, array);
        db.prepare('INSERT INTO uploaded_images(name,uploaded_at,bytes) VALUES(?,?,?)')
          .run(name, Date.now(), bytes.byteLength);
      })();
      return res.status(201).set('Cache-Control', 'no-store')
        .json({ url: '/media/' + name, bytes: bytes.byteLength, format: 'webp' });
    } catch (error) {
      console.error('Durable Object image upload error:', error?.message || 'unknown');
      return res.status(503).json({ error: 'Image storage temporarily unavailable' });
    }
  });

  app.get('/media/:name', (req, res) => {
    const name = String(req.params.name);
    if (!NAME.test(name)) return res.status(404).end();
    const url = '/media/' + name;
    // A known upload is not public until assigned by an administrator.
    const assigned = db.prepare(
      'SELECT 1 FROM site_media WHERE url=? UNION SELECT 1 FROM lessons WHERE cover_url=? LIMIT 1'
    ).get(url, url);
    if (!assigned) return res.status(404).end();
    const raw = images.get(KEY_PREFIX + name);
    if (!raw) return res.status(404).end();
    res.set('Content-Type', 'image/webp');
    res.set('Content-Disposition', 'inline');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(Buffer.from(raw));
  });
}
