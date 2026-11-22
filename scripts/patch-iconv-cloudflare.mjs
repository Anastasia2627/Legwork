/**
 * Cloudflare/Workers bundling fix for iconv-lite.
 *
 * iconv-lite marks some Node.js stream modules as "false" in its browser map.
 * Wrangler/esbuild selects those mappings, but Workers exposes process.versions.node.
 * As a result iconv-lite calls the missing streams factory during Worker boot:
 * "Uncaught TypeError: require_streams(...) is not a function" (10021).
 *
 * Avoid a global monkey patch: remove only the false browser mappings from
 * installed iconv-lite manifests, without touching the original npm package
 * files in Git. Do not patch other packages or application code.
 *
 * https://github.com/cloudflare/workers-sdk/issues/9309
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const problematicKeys = new Set(['./lib/extend-node', './lib/streams', 'stream']);
const isDir = filename => {
  try { return fs.statSync(filename).isDirectory(); } catch { return false; }
};

export function patchIconvLite(root = path.resolve('node_modules')) {
  const changed = [];
  const inspected = new Set();
  let visited = 0;
  const patch = (directory) => {
    const file = path.join(directory, 'package.json');
    if (!fs.existsSync(file)) return;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pkg.name !== 'iconv-lite' || typeof pkg.browser !== 'object' || !pkg.browser) return;
    let removed = 0;
    for (const key of problematicKeys) {
      if (pkg.browser[key] === false) { delete pkg.browser[key]; removed++; }
    }
    if (removed === 0) return;
    if (Object.keys(pkg.browser).length === 0) delete pkg.browser;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
    changed.push({ path: file, removed });
  };
  const scan = (nodeModules, depth = 0) => {
    if (depth > 12 || !isDir(nodeModules)) return;
    const actual = fs.realpathSync(nodeModules);
    if (inspected.has(actual)) return;
    inspected.add(actual);
    for (const entry of fs.readdirSync(nodeModules, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.pnpm') continue;
      if (entry.name.startsWith('@') || entry.name === '.pnpm') {
        const scope = path.join(nodeModules, entry.name);
        if (isDir(scope)) {
          for (const name of fs.readdirSync(scope)) {
            const child = path.join(scope, name);
            if (isDir(child)) {
              if (entry.name === '.pnpm') scan(path.join(child, 'node_modules'), depth + 1);
              else { patch(child); scan(path.join(child, 'node_modules'), depth + 1); }
            }
          }
        }
        continue;
      }
      const directory = path.join(nodeModules, entry.name);
      if (!isDir(directory)) continue;
      visited++;
      if (visited > 12000) throw Error('Aborting unexpectedly deep node_modules traversal');
      patch(directory);
      scan(path.join(directory, 'node_modules'), depth + 1);
    }
  };
  scan(root);
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const changed = patchIconvLite();
  if (changed.length) console.log('Cloudflare iconv-lite compatibility: patched ' + changed.length + ' installed package manifest(s).');
  else console.log('Cloudflare iconv-lite compatibility: no browser stream mappings to patch.');
}
