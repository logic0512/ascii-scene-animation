const LABELS = {
  'alpine-dawn': '雪山与晨光', 'aurora-fjord': '极光与暗岸', 'deep-reef': '海底与珊瑚',
  'desert-night': '沙丘与星夜', earthrise: '地月与太空', 'kyoto-dusk': '园林与暮色',
  'lantern-lake': '灯影与湖水', 'marine-drive': '城市与水岸', 'misty-forest': '山林与雾',
  'night-coast': '海岸与夜色', 'ocean-sunset': '海面与夕照', 'storm-plains': '原野与云层',
  'taj-dawn': '建筑与晨光', 'tokyo-rain': '街巷与雨夜', 'varanasi-ghats': '滨水与灯火'
};

export function normalizeManifest(data) {
  if (!Array.isArray(data)) throw new Error('作品目录应为数组。');
  const seen = new Set();
  const cases = data.filter(item => {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({
    ...item,
    title: typeof item.title === 'string' && item.title.trim() ? item.title : item.id,
    image: typeof item.image === 'string' && /^(?:\.\/)?[a-zA-Z0-9_-]+\/image\.png$/.test(item.image) ? item.image : null
  }));
  if (!cases.length) throw new Error('作品目录中没有可读取的作品。');
  return cases;
}

export function sceneIndex(cases, id) {
  const index = cases.findIndex(item => item.id === id);
  return index < 0 ? 0 : index;
}

export function adjacentIndex(index, step, length) {
  if (!Number.isInteger(length) || length < 1) return -1;
  const current = Number.isInteger(index) && index >= 0 && index < length ? index : 0;
  return ((current + step) % length + length) % length;
}

function polygons(regions) {
  if (!Array.isArray(regions)) return [];
  return regions.map(region => Array.isArray(region) ? region : region?.points).filter(points =>
    Array.isArray(points) && points.length >= 3 && points.every(point =>
      Array.isArray(point) && point.length === 2 && point.every(n => Number.isFinite(n) && n >= 0 && n <= 1)));
}

export function motionSpec(motion) {
  if (!motion || !['water', 'rain'].includes(motion.type)) return null;
  let regions = polygons(motion.regions);
  if (motion.regions === undefined && motion.type === 'water' && Number.isFinite(motion.waterline) && motion.waterline > 0 && motion.waterline < 1) {
    regions = [[[0, motion.waterline], [1, motion.waterline], [1, 1], [0, 1]]];
  }
  return regions.length ? { type: motion.type, regions } : null;
}

export function playback(state, action) {
  switch (action.type) {
    case 'load': return { available: Boolean(action.available), playing: Boolean(action.available && !action.reduced), elapsed: 0 };
    case 'toggle': return { ...state, playing: state.available && !state.playing };
    case 'pause': return { ...state, playing: false };
    case 'reset': return { ...state, playing: false, elapsed: 0 };
    case 'tick': return state.playing ? { ...state, elapsed: state.elapsed + Math.max(0, Math.min(action.delta || 0, 100)) } : state;
    default: return state;
  }
}

function contentLines(value) {
  if (typeof value === 'string') return value.trim() ? [LABELS[value] || value] : [];
  if (Array.isArray(value)) return value.flatMap(contentLines);
  if (value && typeof value === 'object') {
    if (value.id) return [LABELS[value.id] || String(value.id), ...contentLines(value.apply), ...contentLines(value.description)];
    return Object.values(value).flatMap(contentLines);
  }
  return [];
}

function setContent(element, value, fallback) {
  const lines = contentLines(value);
  if (!lines.length) {
    element.replaceChildren(...(fallback ? [Object.assign(document.createElement('p'), { textContent: fallback })] : []));
  } else if (lines.length === 1) {
    element.replaceChildren(Object.assign(document.createElement('p'), { textContent: lines[0] }));
  } else {
    const list = document.createElement('ul');
    list.append(...lines.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    element.replaceChildren(list);
  }
}

function safeSource(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function drawEnvironment(ctx, spec, w, h, t) {
  const cell = w / 240;
  const snap = value => (Math.floor(value / cell) + .5) * cell;
  ctx.save();
  ctx.beginPath();
  for (const points of spec.regions) {
    points.forEach(([x, y], i) => i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h));
    ctx.closePath();
  }
  ctx.clip();
  // Square-grid dots are clipped to the supplied regions; the original image stays fixed.
  const count = spec.type === 'water' ? 48 : 90;
  for (let i = 0; i < count; i++) {
    const x = snap(((i * .61803398875) % 1) * w);
    const shimmer = .5 + .5 * Math.sin(t * 1.3 + i * 2.1);
    const y = snap((((i * .38196601125) % 1 + (spec.type === 'rain' ? t * .12 : 0)) % 1) * h);
    const length = spec.type === 'water' ? 2 + Math.round(3 * shimmer) : 3;
    for (let j = 0; j < length; j++) {
      const water = spec.type === 'water';
      const dx = water ? (j - Math.floor(length / 2)) * cell : 0;
      const dy = water ? 0 : j * cell;
      const alpha = water ? (.025 + .065 * shimmer) * (1 - .12 * Math.abs(j - Math.floor(length / 2))) : .12 * (1 - j * .25);
      ctx.fillStyle = water ? `rgba(191,218,223,${alpha})` : `rgba(197,214,224,${alpha})`;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, cell * .22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function environmentPlayer(canvas, changed) {
  const ctx = canvas.getContext('2d');
  let state = { available: false, playing: false, elapsed: 0 };
  let spec = null;
  let frame = 0;
  let previous = 0;
  function clear() { ctx?.clearRect(0, 0, canvas.width, canvas.height); }
  function draw() {
    clear();
    if (!ctx || !spec) return;
    drawEnvironment(ctx, spec, canvas.width, canvas.height, state.elapsed / 1000);
  }
  function loop(now) {
    frame = 0;
    if (!state.playing) return;
    if (!previous) previous = now;
    if (now - previous >= 1000 / 15) {
      state = playback(state, { type: 'tick', delta: now - previous });
      previous = now;
      draw();
    }
    frame = requestAnimationFrame(loop);
  }
  function dispatch(action) {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    state = playback(state, action);
    if (action.type === 'reset' || !state.available) clear();
    if (state.playing) frame = requestAnimationFrame(loop);
    changed(state);
  }
  return {
    load(motion, image, reduced) {
      spec = motionSpec(motion);
      clear();
      if (image) {
        canvas.width = Math.min(image.naturalWidth, 1600);
        canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
      }
      canvas.hidden = !spec || !ctx;
      dispatch({ type: 'load', available: Boolean(spec && image && ctx), reduced });
      return Boolean(spec && image && ctx);
    },
    dispatch
  };
}

export async function initGallery() {
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let cases = [], index = 0, sequence = 0;
  const player = environmentPlayer($('environment'), state => {
    $('motion-toggle').disabled = !state.available;
    $('motion-reset').disabled = !state.available;
    $('motion-toggle').textContent = state.playing ? '暂停环境动效' : '播放环境动效';
    $('motion-toggle').setAttribute('aria-pressed', String(state.playing));
  });
  function downloadReady(item, available) {
    $('download').setAttribute('aria-disabled', String(!available));
    if (available) {
      $('download').href = item.image;
      $('download').download = `${item.id}.png`;
      $('download').removeAttribute('tabindex');
    } else {
      $('download').removeAttribute('href');
      $('download').removeAttribute('download');
      $('download').tabIndex = -1;
    }
  }
  function showScene(next, updateHistory = false, focus = false) {
    index = next;
    const item = cases[index], token = ++sequence;
    player.load(null, null, true);
    $('stage').hidden = true;
    $('image-status').hidden = false;
    $('image-status').textContent = '正在载入这幅作品…';
    $('work-title').textContent = item.title;
    $('work-base').textContent = `${LABELS[item.base] || '点阵风景'} / ${item.base || item.id}`;
    $('position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(cases.length).padStart(2, '0')}`;
    $('work-description').textContent = typeof item.description === 'string' ? item.description : '';
    $('main-image').alt = item.title + (item.description ? `：${item.description}` : '，点阵风景作品');
    $('motion-label').textContent = '静态点阵作品';
    downloadReady(item, false);
    setContent($('preserve'), item.preserve, '此作品尚未附上场景要素说明。');
    setContent($('art-direction'), item.art_direction, '此作品尚未附上美化说明。');
    setContent($('creative-changes'), item.creative_changes, '');
    setContent($('techniques'), item.techniques, '此作品尚未附上绘制方法说明。');
    const source = safeSource(item.source_page);
    $('source-link').hidden = !source;
    if (source) $('source-link').href = source;
    else $('source-link').removeAttribute('href');
    $('creation-details').open = false;
    for (const card of $('cards').children) card.setAttribute('aria-current', String(card.dataset.id === item.id));
    const url = new URL(location.href);
    url.searchParams.set('scene', item.id);
    if (updateHistory) url.hash = '';
    history[updateHistory ? 'pushState' : 'replaceState']({}, '', url);
    function failure() {
      if (token !== sequence) return;
      $('image-status').textContent = '这幅作品的 PNG 未能载入。请检查图片是否已生成并随画廊一同提供；当前没有用占位图替代。';
    }
    if (!item.image) { failure(); return; }
    const image = new Image();
    image.onload = () => {
      if (token !== sequence) return;
      $('main-image').src = image.src;
      $('stage').hidden = false;
      $('image-status').hidden = true;
      downloadReady(item, true);
      const animated = player.load(item.motion, image, reduced.matches || document.hidden);
      $('motion-label').textContent = animated
        ? `静态点阵作品＋局部环境动效 · ${item.motion.type === 'water' ? '水域微光' : '圆点雨滴'}${reduced.matches ? ' · 已按系统设置暂停' : ''}`
        : '静态点阵作品 · 此幅保留静态展示';
      if (focus) {
        $('work-title').focus({ preventScroll: true });
        $('current-work').scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
      }
    };
    image.onerror = failure;
    image.src = item.image;
  }
  function buildCards() {
    $('cards').replaceChildren(...cases.map((item, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'card'; button.dataset.id = item.id;
      button.setAttribute('aria-label', `查看${item.title}`);
      const preview = document.createElement('span'); preview.className = 'thumbnail';
      const status = document.createElement('span'); status.className = 'thumbnail-status'; status.textContent = '图片载入中';
      preview.append(status);
      if (item.image) {
        const image = new Image(); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
        image.onload = () => { image.hidden = false; status.hidden = true; };
        image.onerror = () => { image.hidden = true; status.textContent = 'PNG 未能载入'; };
        image.src = item.image; preview.append(image);
      } else { status.textContent = 'PNG 路径无效'; }
      const caption = document.createElement('span'); caption.className = 'card-caption';
      const title = document.createElement('span'); title.className = 'card-title'; title.textContent = item.title;
      const base = document.createElement('span'); base.className = 'card-base'; base.textContent = item.base || '';
      caption.append(title, base); button.append(preview, caption);
      button.addEventListener('click', () => showScene(i, true, true));
      return button;
    }));
  }
  $('previous').addEventListener('click', () => showScene(adjacentIndex(index, -1, cases.length), true));
  $('next').addEventListener('click', () => showScene(adjacentIndex(index, 1, cases.length), true));
  $('motion-toggle').addEventListener('click', () => player.dispatch({ type: 'toggle' }));
  $('motion-reset').addEventListener('click', () => player.dispatch({ type: 'reset' }));
  reduced.addEventListener('change', event => { if (event.matches) player.dispatch({ type: 'pause' }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) player.dispatch({ type: 'pause' }); });
  window.addEventListener('popstate', () => {
    if (!cases.length) return;
    const next = sceneIndex(cases, new URL(location.href).searchParams.get('scene'));
    if (next !== index) showScene(next);
  });
  document.addEventListener('keydown', event => {
    if (!cases.length || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (event.target.closest('input, textarea, select, summary, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showScene(adjacentIndex(index, event.key === 'ArrowLeft' ? -1 : 1, cases.length), true);
    }
  });
  try {
    const response = await fetch('./manifest.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`作品目录请求失败（${response.status}）。`);
    cases = normalizeManifest(await response.json());
    $('total-count').textContent = String(cases.length).padStart(2, '0');
    $('previous').disabled = cases.length < 2;
    $('next').disabled = cases.length < 2;
    buildCards();
    const requested = new URL(location.href).searchParams.get('scene');
    if (requested && !cases.some(item => item.id === requested)) $('collection-status').textContent = '链接中的作品未找到，已显示第一幅。';
    showScene(sceneIndex(cases, requested));
  } catch (error) {
    $('work-title').textContent = '作品目录暂未载入';
    $('image-status').textContent = `${error.message} 请通过本地预览或网站地址打开，并确认 manifest.json 已随画廊提供。`;
    $('collection-status').textContent = '目录载入后，这里会显示实际作品缩略图。';
  }
}

if (typeof document !== 'undefined') initGallery();
