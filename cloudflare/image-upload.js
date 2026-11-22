import crypto from 'node:crypto';
import express from 'express';

// Same public URL pattern as the existing SQLite server.
const IMAGE_NAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
const INTERNAL_URL = /^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.webp$/i;
const MAX_INPUT = 6 * 1024 * 1024;
const MAX_OUTPUT = 7 * 1024 * 1024;
export const safePublicImageUrl = (url, externalCheck) => INTERNAL_URL.test(url) || externalCheck(url);

export function registerImageUploads(app, db, { auth, admin, env }) {
  const receive = express.raw({ type: () => true, limit: MAX_INPUT });
  app.post('/api/admin/image-upload', auth, admin, receive, async (req, res) => {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return res.status(415).json({ error: 'Upload a JPEG, PNG or WebP image' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length < 16 || req.body.length > MAX_INPUT) {
      return res.status(413).json({ error: 'Choose an image no larger than 6 MB' });
    }
    if (!env.MEDIA || !env.IMAGES) {
      return res.status(503).json({ error: 'Cloudflare R2 / Images not configured' });
    }
    try {
      const input = new Blob([req.body], { type: mime }).stream();
      // Cloudflare Images must decode the media, not trust Content-Type alone.
      const info = await env.IMAGES.info(input);
      const format = String(info?.format || '').toLowerCase().split('/').pop();
      if (!['jpeg', 'png', 'webp'].includes(format) ||
          (mime === 'image/jpeg' && format !== 'jpeg') ||
          (mime === 'image/png' && format !== 'png') ||
          (mime === 'image/webp' && format !== 'webp') ||
          !info.width || !info.height || info.width * info.height > 20_000_000) {
        return res.status(415).json({ error: 'Unsupported image data or dimensions' });
      }
      const transformation = await env.IMAGES
        .input(new Blob([req.body], { type: mime }).stream())
        .transform({ width: 2200, height: 2200, fit: 'scale-down' })
        .output({ format: 'image/webp', quality: 82, anim: false });
      const converted = transformation.response();
      if (!converted.ok) return res.status(422).json({ error: 'Image transformation failed' });
      const bytes = await converted.arrayBuffer();
      if (bytes.byteLength > MAX_OUTPUT) {
        return res.status(413).json({ error: 'Processed image is too large' });
      }
      const filename = crypto.randomUUID() + '.webp';
      await env.MEDIA.put(filename, bytes, {
        httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=300' },
        customMetadata: { uploadedAt: new Date().toISOString() },
      });
      return res.status(201).set('Cache-Control', 'no-store').json({
        url: '/media/' + filename, bytes: bytes.byteLength, format: 'webp',
      });
    } catch (error) {
      console.error('R2 image upload failed:', error?.message || 'unknown');
      return res.status(422).json({ error: 'Image could not be decoded or stored' });
    }
  });

  app.get('/media/:name', async (req, res) => {
    const name = String(req.params.name);
    if (!IMAGE_NAME.test(name) || !env.MEDIA) return res.status(404).end();
    const url = '/media/' + name;
    // Public only AFTER an admin assigns it to an approved slot or cover.
    const referenced = db.prepare(
      'SELECT 1 FROM site_media WHERE url=? UNION SELECT 1 FROM lessons WHERE cover_url=? LIMIT 1'
    ).get(url, url);
    if (!referenced) return res.status(404).end();
    const object = await env.MEDIA.get(name);
    if (!object) return res.status(404).end();
    res.set('Content-Type', 'image/webp');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=300');
    return res.send(Buffer.from(await object.arrayBuffer()));
  });
}
