/* Image-derived content, rebuilt as character frames using ordered halftoning.
 * This does not execute an upstream ascii.rest scene. Its Piece contract can
 * be rendered by the unchanged upstream mount (MIT, bas3line).
 */
const W = 208, H = 117, N = W * H;
const DOTS = ' ·•●', COVER = [0, .06, .28, .65];
const REFERENCE_COVER = [0, .3, .6, 1];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TYPES = new Set(['water', 'clouds', 'aurora', 'fog', 'stars', 'rain', 'reef', 'light', 'sphere']);
const clamp = x => Math.max(0, Math.min(1, x));
const linear = Float32Array.from({ length: 256 }, (_, i) => i / 255 <= .04045 ? i / 3294.6 : ((i / 255 + .055) / 1.055) ** 2.4);
const srgb = Uint8Array.from({ length: 65536 }, (_, i) => Math.round(255 * (i / 65535 <= .0031308 ? i / 65535 * 12.92 : 1.055 * (i / 65535) ** (1 / 2.4) - .055)));
const GROUND = [linear[8], linear[11], linear[18]];
const byte = x => srgb[Math.round(clamp(x) * 65535)];
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const luminance = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;

function footprint(size, cells) {
  return Array.from({ length: cells }, (_, i) => {
    const a = Math.max(0, (i + .5 - .875) * size / cells);
    const b = Math.min(size, (i + .5 + .875) * size / cells);
    return [a, b];
  });
}
function integral(prefix, edge, size, channel) {
  const i = Math.floor(edge), j = i * 3 + channel;
  return prefix[j] + (i < size ? (edge - i) * (prefix[j + 3] - prefix[j]) : 0);
}

function contentField(rgba, width, height) {
  // Exact fractional-area integration in linear light. The overlapping 1.75-cell
  // footprint suppresses the source dot lattice before a new lattice is drawn.
  const xs = footprint(width, W), ys = footprint(height, H);
  const horizontal = new Float32Array(height * W * 3);
  const prefix = new Float64Array((Math.max(width, height) + 1) * 3);
  for (let y = 0; y < height; y++) {
    prefix[0] = prefix[1] = prefix[2] = 0;
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4, p = x * 3, alpha = rgba[k + 3] / 255;
      for (let c = 0; c < 3; c++) prefix[p + 3 + c] = prefix[p + c] + linear[rgba[k + c]] * alpha + GROUND[c] * (1 - alpha);
    }
    for (let x = 0; x < W; x++) {
      const [a, b] = xs[x], k = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) horizontal[k + c] = (integral(prefix, b, width, c) - integral(prefix, a, width, c)) / (b - a);
    }
  }
  const field = new Float32Array(N * 3);
  for (let x = 0; x < W; x++) {
    prefix[0] = prefix[1] = prefix[2] = 0;
    for (let y = 0; y < height; y++) {
      const k = (y * W + x) * 3, p = y * 3;
      for (let c = 0; c < 3; c++) prefix[p + 3 + c] = prefix[p + c] + horizontal[k + c];
    }
    for (let y = 0; y < H; y++) {
      const [a, b] = ys[y], k = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) field[k + c] = (integral(prefix, b, height, c) - integral(prefix, a, height, c)) / (b - a);
    }
  }
  return field;
}

function colorSignal(r, g, b) {
  const blend = clamp((Math.max(r - GROUND[0], g - GROUND[1], b - GROUND[2]) - .006) / .044);
  return blend * blend * (3 - 2 * blend);
}
function dotLevel(r, g, b) {
  const dark = clamp(luminance(r, g, b)) ** .3;
  const peak = byte(Math.max(r, g, b)) / 255;
  const reference = .15 + .85 * peak ** .85 * .95;
  return dark + (reference - dark) * colorSignal(r, g, b);
}
function dotStep(r, g, b, k) {
  const level = dotLevel(r, g, b);
  const dither = (BAYER[((Math.floor(k / W) & 3) * 4) + (k % W & 3)] + .5) / 16 - .5;
  return Math.max(0, Math.min(3, Math.round(level * 3 + dither)));
}
function ink(r, g, b, step) {
  const cover = COVER[step] || 1;
  const physical = [byte(GROUND[0] + (r - GROUND[0]) / cover), byte(GROUND[1] + (g - GROUND[1]) / cover), byte(GROUND[2] + (b - GROUND[2]) / cover)];
  if (!step) return physical;
  // Borrow peak-normalized hue/coverage compensation from night-coast;
  // gate it by source signal so black ground and dark banks are not lifted.
  const rgb = [byte(r) / 255, byte(g) / 255, byte(b) / 255];
  const peak = Math.max(...rgb, 1e-4);
  // Upstream uses relative glyph coverage here, not physical cell area;
  // retaining it also avoids flattening bright animated dots to one full ink.
  const want = Math.min(1, (dotLevel(r, g, b) + .06) / REFERENCE_COVER[step]);
  const scale = (.3 + .7 * want) / peak, blend = colorSignal(r, g, b);
  return rgb.map((c, i) => Math.round(physical[i] + (clamp(c * scale) * 255 - physical[i]) * blend));
}

function colorTable(field) {
  const histogram = new Map();
  for (let k = 0; k < N; k++) {
    const j = k * 3;
    for (const gain of [.82, 1, 1.18]) {
      const r = field[j] * gain, g = field[j + 1] * gain, b = field[j + 2] * gain;
      const rgb = ink(r, g, b, dotStep(r, g, b, k));
      const key = (rgb[0] >> 3) * 1024 + (rgb[1] >> 3) * 32 + (rgb[2] >> 3);
      const entry = histogram.get(key) || [0, 0, 0, 0];
      for (let c = 0; c < 3; c++) entry[c] += rgb[c];
      entry[3]++;
      histogram.set(key, entry);
    }
  }
  const points = [...histogram.values()].map(p => [p[0] / p[3], p[1] / p[3], p[2] / p[3], p[3]]);
  function box(points) {
    const ranges = [0, 1, 2].map(c => {
      let lo = 255, hi = 0;
      for (const p of points) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); }
      return hi - lo;
    });
    const channel = ranges.indexOf(Math.max(...ranges));
    const weight = points.reduce((sum, p) => sum + p[3], 0);
    return { points, channel, weight, score: points.length > 1 ? ranges[channel] * weight ** .25 : 0 };
  }
  const boxes = [box(points)];
  while (boxes.length < 63) {
    let at = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].score > boxes[at].score) at = i;
    const current = boxes[at];
    if (!current.score) break;
    current.points.sort((a, b) => a[current.channel] - b[current.channel]);
    let weight = 0, split = 1;
    for (; split < current.points.length; split++) {
      weight += current.points[split - 1][3];
      if (weight >= current.weight / 2) break;
    }
    split = Math.min(split, current.points.length - 1);
    boxes.splice(at, 1, box(current.points.slice(0, split)), box(current.points.slice(split)));
  }
  const rgb = [[8, 11, 18], ...boxes.map(b => [0, 1, 2].map(c => Math.round(b.points.reduce((sum, p) => sum + p[c] * p[3], 0) / b.weight)))];
  const palette = rgb.map(p => '#' + p.map(c => c.toString(16).padStart(2, '0')).join(''));
  const nearest = new Uint8Array(32768);
  // The RGB grid is only an index into a nearest-colour LUT, not the palette.
  for (let key = 0; key < nearest.length; key++) {
    const r = (key >> 10) * 8 + 4, g = ((key >> 5) & 31) * 8 + 4, b = (key & 31) * 8 + 4;
    let best = Infinity;
    for (let i = 0; i < rgb.length; i++) {
      const p = rgb[i], distance = .3 * (r - p[0]) ** 2 + .59 * (g - p[1]) ** 2 + .11 * (b - p[2]) ** 2;
      if (distance < best) { best = distance; nearest[key] = i; }
    }
  }
  return { palette, nearest };
}

function polygons(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array of polygons`);
  return value.map(p => {
    if (!Array.isArray(p) || p.length < 3 || p.some(v => !Array.isArray(v) || v.length !== 2 || v.some(n => !Number.isFinite(n) || n < 0 || n > 1))) throw new TypeError(`${name} contains an invalid normalized polygon`);
    const area = p.reduce((sum, [x, y], i) => { const [nx, ny] = p[(i + 1) % p.length]; return sum + x * ny - nx * y; }, 0);
    if (Math.abs(area) < 1e-10) throw new TypeError(`${name} contains a zero-area polygon`);
    return p;
  });
}
function inside(polygon, x, y) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j], [bx, by] = polygon[i];
    if (Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-12 && x >= Math.min(ax, bx) - 1e-12 && x <= Math.max(ax, bx) + 1e-12 && y >= Math.min(ay, by) - 1e-12 && y <= Math.max(ay, by) + 1e-12) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}
function edgeInRect(a, b, left, top, right, bottom) {
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [[a[0], b[0] - a[0], left, right], [a[1], b[1] - a[1], top, bottom]]) {
    if (Math.abs(delta) < 1e-15) { if (start < min || start > max) return false; }
    else { const t1 = (min - start) / delta, t2 = (max - start) / delta; low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2)); }
    if (low > high) return false;
  }
  return true;
}
function maskFor(regions, protectedRegions) {
  const mask = new Uint8Array(N), cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = x / W, r = (x + 1) / W, a = y / H, b = (y + 1) / H;
    const corners = [[l, a], [r, a], [r, b], [l, b]], epsilon = 1e-10;
    // Conservatively accept full cells only, and exclude any cell touched by protection.
    const contained = regions.some(p => corners.every(([cx, cy]) => inside(p, cx, cy)) && !p.some((v, i) => edgeInRect(v, p[(i + 1) % p.length], l + epsilon, a + epsilon, r - epsilon, b - epsilon)));
    if (!contained) continue;
    const protectedHit = protectedRegions.some(p => corners.some(([cx, cy]) => inside(p, cx, cy)) || p.some((v, i) => edgeInRect(v, p[(i + 1) % p.length], l, a, r, b)));
    if (!protectedHit) { const k = y * W + x; mask[k] = 1; cells.push(k); }
  }
  const feather = Uint8Array.from(mask, v => v ? 3 : 0);
  for (let k = 0; k < N; k++) if (mask[k]) feather[k] = Math.min(feather[k], k % W ? feather[k - 1] + 1 : 1, k >= W ? feather[k - W] + 1 : 1);
  for (let k = N - 1; k >= 0; k--) if (mask[k]) feather[k] = Math.min(feather[k], k % W < W - 1 ? feather[k + 1] + 1 : 1, k < N - W ? feather[k + W] + 1 : 1);
  return { mask, cells, feather };
}

export function createScene(rgba, width, height, item = {}) {
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !Number.isSafeInteger(width * height * 4) || rgba.length !== width * height * 4) throw new TypeError('Expected full-image RGBA bytes and matching positive integer dimensions');
  const field = contentField(rgba, width, height);
  const { palette, nearest } = colorTable(field);
  const dotLevels = new Uint16Array(32768), dotInks = new Uint8Array(32768 * 4);
  const groundKey = (8 >> 3) * 1024 + (11 >> 3) * 32 + (18 >> 3);
  // Per-image tables retain the existing tone/hue recipe. Frames only quantize
  // RGB, apply Bayer thresholds and read the final palette index (192 KiB).
  for (let key = 0; key < 32768; key++) {
    let r = linear[(key >> 10) * 8 + 4], g = linear[((key >> 5) & 31) * 8 + 4], b = linear[(key & 31) * 8 + 4];
    // Anchor the background bin: tiny quantization errors amplify at small coverage.
    if (key === groundKey) [r, g, b] = GROUND;
    dotLevels[key] = Math.round(dotLevel(r, g, b) * 65535);
    for (let step = 1; step < 4; step++) {
      const rgb = ink(r, g, b, step);
      dotInks[key * 4 + step] = nearest[(rgb[0] >> 3) * 1024 + (rgb[1] >> 3) * 32 + (rgb[2] >> 3)];
    }
  }
  const peak = k => Math.max(field[k * 3], field[k * 3 + 1], field[k * 3 + 2]);
  const configs = item.motion?.layers ?? [];
  if (!Array.isArray(configs)) throw new TypeError('motion.layers must be an array');
  const allProtected = configs.flatMap((layer, i) => polygons(layer?.protected, `layers[${i}].protected`));
  const layers = configs.map((layer, i) => {
    if (!layer || !TYPES.has(layer.type)) throw new TypeError(`Unsupported motion layer at ${i}`);
    const regions = polygons(layer.regions, `layers[${i}].regions`);
    const mask = maskFor(regions, allProtected);
    const ys = regions.flatMap(p => p.map(v => v[1]));
    const top = ys.length ? Math.min(...ys) * H : 0, bottom = ys.length ? Math.max(...ys) * H : H;
    let cells = mask.cells;
    if (layer.type === 'stars') {
      cells = cells.filter(k => {
        // A tiny bright source star is diluted by area integration; use local
        // contrast below, rather than requiring a bright full-cell average.
        if (peak(k) < .035) return false;
        const x = k % W, y = Math.floor(k / W);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = k + dy * W + dx;
          if ((dx || dy) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H && (peak(j) > peak(k) || (peak(j) === peak(k) && j < k))) return false;
        }
        let ring = 0, count = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === 3 && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) { ring += peak(k + dy * W + dx); count++; }
        }
        return count > 0 && peak(k) > ring / count * 1.3 + .015;
      }).sort((a, b) => peak(b) - peak(a)).slice(0, 48);
    }
    return { type: layer.type, ...mask, cells, top, bottom };
  });
  const baseGlyph = new Array(N), baseColor = new Uint8Array(N);
  function encode(k, r, g, b, glyph, color) {
    const key = (byte(r) >> 3) * 1024 + (byte(g) >> 3) * 32 + (byte(b) >> 3);
    const dither = (BAYER[((Math.floor(k / W) & 3) * 4) + (k % W & 3)] + .5) / 16 - .5;
    const step = Math.max(0, Math.min(3, Math.round(dotLevels[key] * (3 / 65535) + dither)));
    glyph[k] = DOTS[step];
    color[k] = dotInks[key * 4 + step];
  }
  for (let k = 0; k < N; k++) encode(k, field[k * 3], field[k * 3 + 1], field[k * 3 + 2], baseGlyph, baseColor);
  const active = [...new Set(layers.flatMap(layer => layer.cells))];
  const meta = { name: String(item.title || item.id || 'image scene').toLowerCase(), category: 'scenes', note: 'image-derived character scene with local procedural motion', cols: W, rows: H, cell: 1, fps: 15, ground: '#080b12', palette, clock: false };
  return {
    meta,
    default() {
      const work = new Float32Array(field.length), glyph = new Array(N), colors = new Uint8Array(N);
      return (time, env = {}) => {
        if (!Number.isFinite(time) || time < 0) throw new RangeError('Frame time must be finite and non-negative');
        if (env.color !== undefined && (!(env.color instanceof Uint8Array) || env.color.length !== N)) throw new TypeError('env.color must contain exactly 208×117 byte indices');
        const t = time % 3600;
        work.set(field); colors.set(baseColor);
        for (let k = 0; k < N; k++) glyph[k] = baseGlyph[k];
        for (const layer of layers) for (const k of layer.cells) {
          const x = k % W, y = Math.floor(k / W), j = k * 3, edge = layer.feather[k] / 3;
          const depth = clamp((y - layer.top) / Math.max(1, layer.bottom - layer.top));
          let r = work[j], g = work[j + 1], b = work[j + 2], gain = 1;
          if (layer.type === 'water' || layer.type === 'clouds') {
            const displacement = layer.type === 'water' ? (.25 + .9 * depth) * Math.sin(y * (.28 + .13 * depth) + t * 1.1) : .4 * Math.sin(y * .06 + t * .15);
            const sx = Math.max(0, Math.min(W - 1, x + displacement * edge)), left = Math.floor(sx), right = Math.min(W - 1, left + 1), f = sx - left;
            const a = y * W + left, c = y * W + right;
            if (layer.mask[a] && layer.mask[c]) {
              r += (field[a * 3] * (1 - f) + field[c * 3] * f - field[j]) * edge;
              g += (field[a * 3 + 1] * (1 - f) + field[c * 3 + 1] * f - field[j + 1]) * edge;
              b += (field[a * 3 + 2] * (1 - f) + field[c * 3 + 2] * f - field[j + 2]) * edge;
            }
            gain = layer.type === 'water' ? 1 + .09 * edge * Math.sin(x * .37 + y * (.4 + .4 * depth) - t * 1.7) * (hash(x, y) > .5 ? 1 : .25) : 1 + edge * (.06 * Math.sin(x * .045 + y * .08 - t * .17) + .025 * Math.sin(x * .09 - y * .03 + t * .11));
          } else if (layer.type === 'aurora') {
            if (r > g * 1.1 && r > b * .85) gain = 1 + .14 * edge * Math.sin(x * .075 + y * .015 + t * .45);
          } else if (layer.type === 'fog') {
            const amount = edge * (.045 + .025 * Math.sin(x * .03 + y * .055 - t * .2));
            r += (.22 - r) * amount; g += (.24 - g) * amount; b += (.28 - b) * amount;
          } else if (layer.type === 'stars') {
            // Fade existing stars enough to vary coverage after hue normalization.
            gain = .55 - .45 * Math.sin(t * (1.1 + hash(x, y)) + hash(y, x) * 6);
          } else if (layer.type === 'rain') {
            const period = 13 + Math.floor(hash(x, 22) * 10);
            const phase = (y + t * 21 + hash(x, 7) * period) % period;
            if (hash(x, 4) > .72 && phase < 2.2) {
              const amount = .14 * edge * (1 - phase / 3);
              r += (.35 - r) * amount; g += (.43 - g) * amount; b += (.50 - b) * amount;
            }
          } else if (layer.type === 'reef') {
            gain = 1 + edge * (.06 * Math.sin(x * .08 + y * .025 - t * .3) + .035 * Math.sin(y * .14 + x * .04 + t * .4));
          } else if (layer.type === 'light') {
            if (r > g * .95 && g > b * 1.15 && luminance(r, g, b) > .08) gain = 1 + .12 * edge * Math.sin(t * 2.1 + hash(x, y) * 6);
          } else if (layer.type === 'sphere') {
            gain = 1 + .09 * edge * Math.sin(t * .22 + (x / W - .5) * 2) * Math.cos((depth - .5) * 2);
          }
          work[j] = clamp(r * gain); work[j + 1] = clamp(g * gain); work[j + 2] = clamp(b * gain);
        }
        for (const k of active) encode(k, work[k * 3], work[k * 3 + 1], work[k * 3 + 2], glyph, colors);
        if (env.color) env.color.set(colors);
        const lines = [];
        for (let y = 0; y < H; y++) lines.push(glyph.slice(y * W, (y + 1) * W).join(''));
        return lines.join('\n');
      };
    }
  };
}
