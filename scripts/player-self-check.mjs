import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../examples/player.js', import.meta.url), 'utf8')).replace("import { mount } from './mount.js';", `
let tick, stops = 0;
function mount(canvas, piece, options) {
 const frame = piece.default();
 tick = time => frame(time, {});
 tick(0);
 return () => { stops++; };
}
export function advance(time) { tick(time); }
export function stopped() { return stops; }
`);
const { scenePlayer, advance, stopped } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const canvas = { dataset: {} }, states = [], times = [];
const piece = { meta: { fps: 15 }, default: () => time => { times.push(time); return '·'; } };
const player = scenePlayer(canvas, state => states.push(state));
player.load(piece, false); advance(1.043);
assert.equal(canvas.dataset.time, '1.000');
player.dispatch({ type: 'pause' });
assert.equal(states.at(-1).playing, false);
assert.equal(canvas.dataset.time, '1.000');
player.dispatch({ type: 'play' }); advance(.5);
assert.equal(canvas.dataset.time, '1.533', 'Resume must retain the scene clock');
player.dispatch({ type: 'reset' });
assert.equal(canvas.dataset.time, '0.000');
assert.equal(states.at(-1).playing, false);
player.load(piece, true);
assert.equal(states.at(-1).playing, false);
player.dispatch({ type: 'toggle' });
assert.equal(states.at(-1).playing, true);
player.load(null, true);
assert.equal(states.at(-1).available, false);
assert.ok(stopped() >= 6, 'Switching controls must stop prior mount');
console.log('PASS: fixed-rate character clock, pause/resume continuity, reset, reduced motion and prior mount cleanup.');
