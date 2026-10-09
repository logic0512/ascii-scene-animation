import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Import the exact gallery source as ESM without depending on a repository package.json.
const sourceURL = new URL('../examples/gallery.js', import.meta.url);
const source = await readFile(sourceURL, 'utf8');
const { normalizeManifest, sceneIndex, adjacentIndex } = await import(`data:text/javascript;base64,${Buffer.from(source.replace(/^import .*;$/gm,'')).toString('base64')}`);
const fixture = Array.from({ length: 15 }, (_, i) => ({
  id: `scene-${i}`, base: 'night-coast', title: `作品${i}`, image: `scene-${i}/image.png`,
  preserve: ['岸线与地标'], creative_changes: ['调整明暗'], motion: { type: 'water', waterline: .6 }
}));
const cases = normalizeManifest(fixture);
assert.equal(cases.length, 15);
assert.equal(sceneIndex(cases, 'scene-8'), 8);
assert.equal(sceneIndex(cases, 'missing'), 0);
assert.equal(sceneIndex(cases, null), 0);
assert.equal(adjacentIndex(0, -1, 15), 14);
assert.equal(adjacentIndex(14, 1, 15), 0);
assert.equal(adjacentIndex(99, 1, 15), 1);
assert.equal(adjacentIndex(0, 1, 0), -1);
assert.throws(() => normalizeManifest({ cases: fixture }));
assert.throws(() => normalizeManifest([]));
assert.equal(normalizeManifest([null, fixture[0], fixture[0]]).length, 1);
assert.equal(normalizeManifest([{ id: 'unsafe', image: '../other/image.png' }])[0].image, null);
assert.equal(normalizeManifest([{ id: 'unsafe', image: 'https://elsewhere/image.png' }])[0].image, null);
const html = await readFile(new URL('../examples/index.html', import.meta.url), 'utf8');
const requiredIds = [...source.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
for (const id of new Set(requiredIds)) assert.ok(html.includes(`id="${id}"`), `Missing element #${id}`);
assert.match(html, /lang="zh-CN"/);
assert.match(source, /createScene/);
assert.match(source, /prefers-reduced-motion/);
assert.match(source, /token !== sequence/);

const manifestURL = new URL('../examples/manifest.json', import.meta.url);
const actual = normalizeManifest(JSON.parse(await readFile(manifestURL, 'utf8')));
assert.equal(actual.length, 15, 'Release manifest must contain 15 distinct cases');
assert.ok(actual.every(item => item.image), 'Release manifest contains invalid PNG paths');
const profiles = JSON.parse(await readFile(new URL('../references/techniques.json', import.meta.url), 'utf8'));
assert.deepEqual(actual.map(c=>c.base).sort(), profiles.map(c=>c.id).sort());
for (const item of actual) {
  const bytes = await readFile(new URL(item.image, manifestURL));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],item.image_dimensions);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.image_sha256);
  assert.equal((await readFile(new URL(`${item.id}/prompt.txt`,manifestURL),'utf8')).trim(),item.prompt);
  assert.equal(item.visual_review.status,'reviewed');
}
console.log('PASS: 15 internal composition sources retain hashes, dimensions, prompts and content review; all 15 animation methods covered.');
console.log(`PASS: manifest validation, navigation fallback and actual-character player DOM bindings.\nSource: ${fileURLToPath(sourceURL)}`);

assert.ok(!html.includes('<img'), 'Internal PNG cannot be displayed as a finished scene');
assert.ok(!html.includes('下载 PNG'));
assert.ok(!source.includes('drawEnvironment'));
assert.match(source, /mount\(stage, piece, \{ fps: 0 \}\)/, 'Thumbnails use the same actual character renderer');
for (const item of actual) {
 assert.equal(item.image_role, 'internal-composition-source');
 assert.ok(item.motion.layers.length > 0);
}
