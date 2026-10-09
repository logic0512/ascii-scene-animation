import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const source = await readFile(new URL('../examples/scene.js', import.meta.url), 'utf8');
const { createScene } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const W = 208, H = 117, N = W * H;
const width = W * 4, height = H * 4;
const rgba = new Uint8ClampedArray(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const j = (y * width + x) * 4, wave = Math.sin(x * .04 + y * .03);
  rgba[j] = 100 + 70 * (x / width) + 25 * wave;
  rgba[j + 1] = 55 + 70 * (y / height) + 20 * wave;
  rgba[j + 2] = 50 + 40 * (1 - y / height);
  rgba[j + 3] = 255;
}
// Existing sparse bright stars, not synthetic stars introduced by the effect.
for (const [sx, sy] of [[.25, .3], [.42, .4], [.68, .65]]) {
  for (let y = Math.floor(sy * height) - 4; y <= sy * height + 4; y++) for (let x = Math.floor(sx * width) - 4; x <= sx * width + 4; x++) {
    const j = (y * width + x) * 4;
    rgba[j] = 245; rgba[j + 1] = 235; rgba[j + 2] = 220;
  }
}
const regions = [[[.15, .2], [.85, .2], [.85, .8], [.15, .8]]];
const protectedRegions = [[[.47, .35], [.57, .35], [.57, .6], [.47, .6]]];
const types = ['water', 'clouds', 'aurora', 'fog', 'stars', 'rain', 'reef', 'light', 'sphere'];
const bases = ['alpine-dawn', 'aurora-fjord', 'deep-reef', 'desert-night', 'earthrise', 'kyoto-dusk', 'lantern-lake', 'marine-drive', 'misty-forest', 'night-coast', 'ocean-sunset', 'storm-plains', 'taj-dawn', 'tokyo-rain', 'varanasi-ghats'];
function render(piece, t, frame = piece.default()) {
  const color = new Uint8Array(N), text = frame(t, { color }), lines = text.split('\n');
  assert.equal(lines.length, H);
  assert.ok(lines.every(line => line.length === W && /^[ ·•●]+$/.test(line)));
  assert.ok(color.every(i => i < piece.meta.palette.length));
  return { text, glyph: lines.join(''), color };
}
const still = render(createScene(rgba, width, height), 0);
let initialTotal = 0;
for (const type of types) {
  const start = performance.now();
  const piece = createScene(rgba, width, height, { id: type, motion: { layers: [{ type, regions, protected: protectedRegions }] } });
  initialTotal += performance.now() - start;
  assert.equal(piece.meta.cols, W); assert.equal(piece.meta.rows, H); assert.equal(piece.meta.cell, 1); assert.equal(piece.meta.fps, 15);
  assert.ok(piece.meta.palette.length <= 64 && piece.meta.palette.length > 1);
  assert.ok(piece.meta.palette.every(color => /^#[0-9a-f]{6}$/.test(color)));
  const frame = piece.default(), zero = render(piece, 0, frame), one = render(piece, 1, frame);
  assert.deepEqual(render(piece, 0, frame), zero, `${type}: frame depends on call order`);
  assert.deepEqual(render(piece, 1), one, `${type}: frame factories differ`);
  let changed = 0;
  for (let k = 0; k < N; k++) {
    const x = (k % W + .5) / W, y = (Math.floor(k / W) + .5) / H;
    const outside = x < .15 || x > .85 || y < .2 || y > .8;
    const protectedCell = x >= .47 && x <= .57 && y >= .35 && y <= .6;
    const different = zero.glyph[k] !== one.glyph[k] || zero.color[k] !== one.color[k];
    if (outside || protectedCell) {
      assert.ok(!different, `${type}: region/protection leak at ${k}`);
      assert.equal(zero.glyph[k], still.glyph[k]); assert.equal(zero.color[k], still.color[k]);
    }
    changed += Number(different);
  }
  assert.ok(changed > 0, `${type}: no character or colour animation`);
  if (type === 'stars') assert.ok(changed <= 48, 'Stars must be sparse existing local maxima');
  assert.throws(() => frame(-1), RangeError); assert.throws(() => frame(Infinity), RangeError); assert.throws(() => frame(NaN), RangeError);
  assert.throws(() => frame(0, { color: new Uint8Array(3) }), TypeError);
  render(piece, Number.MAX_VALUE);
  console.log(`PASS ${type}: ${changed} changed cells, outside/protected stable.`);
}
// All 15 metadata identities use the same Piece contract without a browser or manifest.
for (const base of bases) {
  const piece = createScene(new Uint8Array([180, 120, 70, 255]), 1, 1, { id: base, title: base });
  assert.equal(piece.meta.name, base);
  assert.equal(render(piece, 0).text, render(piece, 1).text);
}
const flatStars = createScene(new Uint8Array([180, 120, 70, 255]), 1, 1, { motion: { layers: [{ type: 'stars', regions }] } });
assert.deepEqual(render(flatStars, 0), render(flatStars, 1), 'Stars must not be invented on a flat bright surface');
const faintStar = new Uint8Array(width * height * 4);
for (let k = 0; k < width * height; k++) faintStar.set([12, 18, 28, 255], k * 4);
for (let y = 140; y < 149; y++) for (let x = 210; x < 219; x++) faintStar.set([90, 105, 125, 255], (y * width + x) * 4);
const averagedStar = createScene(faintStar, width, height, { motion: { layers: [{ type: 'stars', regions }] } });
assert.notDeepEqual(render(averagedStar, 0), render(averagedStar, 3), 'Area-averaged faint existing stars must retain twinkle');
const noRedAurora = createScene(new Uint8Array([25, 170, 90, 255]), 1, 1, { motion: { layers: [{ type: 'aurora', regions }] } });
assert.deepEqual(render(noRedAurora, 0), render(noRedAurora, 1), 'A red-aurora effect must not invent a new green curtain');
const redCurtain = createScene(new Uint8Array([70, 10, 30, 255]), 1, 1);
const redFrame = render(redCurtain, 0);
assert.ok(redFrame.glyph.includes('•'), 'Saturated red should reach medium dots using peak brightness');
const redInks = redCurtain.meta.palette.filter((_, i) => redFrame.color.includes(i)).map(s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)));
assert.ok(redInks.some(([r, g, b]) => r > 220 && r > g * 2 && r > b * 1.5), 'Red ink should be bright without becoming grey');
const groundPiece = createScene(new Uint8Array([8, 11, 18, 255]), 1, 1), groundFrame = render(groundPiece, 0);
assert.ok([...new Set(groundFrame.color)].every(index => Math.max(...[1, 3, 5].map(i => parseInt(groundPiece.meta.palette[index].slice(i, i + 2), 16))) < 26), 'Rendered black ground must not acquire normalized bright inks');
assert.ok(!groundFrame.glyph.includes('•') && !groundFrame.glyph.includes('●'), 'Dark ground must retain small/sparse dots');
assert.throws(() => createScene(rgba, 0, height), TypeError);
assert.throws(() => createScene(rgba, width - 1, height), TypeError);
assert.throws(() => createScene(rgba, width, height, { motion: { layers: [{ type: 'water', regions: [[[0, 0], [2, 0], [1, 1]]] }] } }), TypeError);
assert.throws(() => createScene(rgba, width, height, { motion: { layers: [{ type: 'water', regions: [[[0, 0], [.5, .5], [1, 1]]] }] } }), TypeError);
// Protection applies across overlapping layers, including one that has no own protection.
const overlap = createScene(rgba, width, height, { motion: { layers: [{ type: 'rain', regions, protected: protectedRegions }, { type: 'water', regions }] } });
const a = render(overlap, 0), b = render(overlap, 1);
for (let y = 42; y < 69; y++) for (let x = 99; x < 118; x++) { const k = y * W + x; assert.equal(a.glyph[k], b.glyph[k]); assert.equal(a.color[k], b.color[k]); }
const frame = overlap.default(), color = new Uint8Array(N);
for (let i = 0; i < 20; i++) frame(i / 15, { color });
const timings = [];
for (let i = 0; i < 90; i++) { const start = performance.now(); frame(i / 15, { color }); timings.push(performance.now() - start); }
timings.sort((a, b) => a - b);
console.log(`PASS: nine effects, fifteen metadata identities, finite-time/contract validation and deterministic frames.`);
console.log(`Synthetic ${width}×${height} RGBA init average (9 effects): ${(initialTotal / types.length).toFixed(1)} ms.`);
console.log(`Two overlapping layers, ${N} cells: average ${(timings.reduce((a,b)=>a+b,0)/timings.length).toFixed(2)} ms/frame, p95 ${timings[Math.floor(timings.length * .95)].toFixed(2)} ms, worst ${timings.at(-1).toFixed(2)} ms. Excludes browser mount, PNG decoding and real case QA.`);
