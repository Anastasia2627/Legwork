import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeWatchUrl,safeCoverPreviewUrl} from '../public/admin-lesson-preview.js';

test('staff video preview accepts official HTTPS YouTube video formats without embedding',()=>{
 assert.equal(youtubeWatchUrl('https://youtu.be/dQw4w9WgXcQ?si=abc'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(youtubeWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=20'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(youtubeWatchUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 assert.equal(youtubeWatchUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'),'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});
test('staff preview rejects untrusted URLs and never creates a player URL',()=>{
 for(const url of [
  '','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
  'http://youtu.be/dQw4w9WgXcQ','https://youtu.be/too-short',
  'https://user:pass@youtu.be/dQw4w9WgXcQ',
  'https://youtu.be:8443/dQw4w9WgXcQ','javascript:alert(1)',
  'https://vimeo.com/12345','https://www.youtube.com/watch?v=invalid'
 ]) assert.equal(youtubeWatchUrl(url),'',url);
});
test('staff image preview only accepts HTTPS and canonical local media paths',()=>{
 assert.equal(safeCoverPreviewUrl('/media/a.webp'),'/media/a.webp');
 assert.equal(safeCoverPreviewUrl('https://images.example.org/cover.webp'),'https://images.example.org/cover.webp');
 for(const url of [
  '','data:image/svg+xml,alert(1)','javascript:alert(1)',
  'http://images.example.org/cover.png','//evil.example/image.webp',
  '/api/learning/private-video','/media/../../admin','/media/a.webp?token=abc',
  'https://user:secret@images.example.org/photo.webp','https://images.example.org:8443/photo.webp'
 ]) assert.equal(safeCoverPreviewUrl(url),'',url);
});
