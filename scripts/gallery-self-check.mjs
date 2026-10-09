import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Import the exact gallery source as ESM without depending on a repository package.json.
const sourceURL = new URL('../examples/gallery.js', import.meta.url);
const source = await readFile(sourceURL, 'utf8');
const { normalizeManifest, sceneIndex, adjacentIndex, motionSpec, playback, drawEnvironment } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
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
assert.equal(motionSpec({ type: 'water' }), null);
assert.equal(motionSpec({ type: 'water', waterline: 0 }), null);
assert.equal(motionSpec({ type: 'water', waterline: .6, regions: [] }), null);
assert.equal(motionSpec({ type: 'aurora', regions: [[[0, 0], [1, 0], [1, 1]]] }), null);
assert.equal(motionSpec({ type: 'rain', regions: [[[-1, 0], [1, 0], [1, 1]]] }), null);
assert.equal(motionSpec({ type: 'water', waterline: .6 }).regions[0][0][1], .6);
assert.equal(motionSpec({ type: 'water', regions: [{ points: [[0, .6], [1, .7], [1, 1]] }] }).regions.length, 1);
assert.equal(motionSpec({ type: 'rain', waterline: .4 }), null);
let state = playback({}, { type: 'load', available: true, reduced: true });
assert.equal(state.playing, false);
state = playback(state, { type: 'toggle' });
state = playback(state, { type: 'tick', delta: 70 });
assert.equal(state.elapsed, 70);
state = playback(state, { type: 'pause' });
assert.equal(playback(state, { type: 'tick', delta: 70 }).elapsed, 70);
state = playback(state, { type: 'toggle' });
state = playback(state, { type: 'reset' });
assert.equal(state.elapsed, 0);
assert.equal(state.playing, false);
assert.equal(playback(state, { type: 'load', available: false, reduced: false }).playing, false);
assert.equal(playback({ available: false }, { type: 'toggle' }).playing, false);

function renderDots(type, time, width = 1200, height = 800) {
  const dots = [], boundary = [];
  let clipped = false, restored = false;
  const ctx = {
    save() {}, beginPath() {}, closePath() {},
    moveTo(...point) { assert.equal(clipped, false); boundary.push(point); },
    lineTo(...point) { assert.equal(clipped, false); boundary.push(point); },
    clip() { clipped = true; },
    arc(x, y, radius, start, end) {
      assert.ok(clipped, 'Every dot must be drawn after region clipping');
      assert.equal(start, 0); assert.equal(end, Math.PI * 2);
      dots.push({ x, y, radius, color: this.fillStyle });
    },
    fill() {}, restore() { restored = true; }
    // No stroke, curve or drawImage API: continuous lines and image resampling fail here.
  };
  drawEnvironment(ctx, { type, regions: [[[.1, .6], [.8, .7], [.9, 1]]] }, width, height, time);
  assert.deepEqual(boundary, [[width * .1, height * .6], [width * .8, height * .7], [width * .9, height]]);
  assert.ok(restored);
  const cell = width / 240;
  for (const dot of dots) {
    for (const coord of [dot.x, dot.y]) assert.ok(Math.abs((coord / cell - .5) - Math.round(coord / cell - .5)) < 1e-9, 'Dots must share one square grid');
    assert.ok(dot.radius < cell / 2, 'Adjacent dots must remain separated');
    const alpha = Number(dot.color.match(/,([^,]+)\)$/)[1]);
    assert.ok(alpha > 0 && alpha <= (type === 'water' ? .09 : .12) + 1e-12);
  }
  return dots;
}
for (const type of ['water', 'rain']) {
  const first = renderDots(type, 0);
  assert.ok(first.length > 0);
  assert.notDeepEqual(first, renderDots(type, 1), `${type} dots must change over time`);
  renderDots(type, 1, 1537, 997);
}

const html = await readFile(new URL('../examples/index.html', import.meta.url), 'utf8');
const requiredIds = [...source.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
for (const id of new Set(requiredIds)) assert.ok(html.includes(`id="${id}"`), `Missing element #${id}`);
assert.match(html, /lang="zh-CN"/);
assert.match(source, /1000 \/ 15/);
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
console.log(`PASS: 15 actual PNG files, hashes, dimensions, prompts, reviewed states and technique coverage.`);
console.log(`PASS: manifest import, navigation fallback, clipped square-grid dots, brightness limits, pause/reset and DOM bindings.\nSource: ${fileURLToPath(sourceURL)}`);
