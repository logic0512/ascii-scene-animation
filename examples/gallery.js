import { createScene } from './scene.js';
import { mount } from './mount.js';
import { scenePlayer, recordVideo } from './player.js';

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

function thumbnailFrame(canvas, piece) {
  // Render at a legible grid size before scaling into a small card.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:832px;';
  const stage = document.createElement('canvas'); host.append(stage); document.body.append(host);
  try {
    const stop = mount(stage, piece, { fps: 0 });
    canvas.width = stage.width; canvas.height = stage.height;
    canvas.getContext('2d').drawImage(stage, 0, 0);
    stop();
  } finally { host.remove(); }
}

const pieces = new Map();
async function loadPiece(item) {
  if (!pieces.has(item.id)) pieces.set(item.id, (async () => {
    if (!item.image) throw new Error('构图素材路径无效。');
    const image = new Image();
    image.src = item.image;
    await image.decode();
    const source = document.createElement('canvas');
    source.width = image.naturalWidth; source.height = image.naturalHeight;
    const ctx = source.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    return createScene(ctx.getImageData(0, 0, source.width, source.height).data, source.width, source.height, item);
  })().catch(error => { pieces.delete(item.id); throw error; }));
  return pieces.get(item.id);
}

export async function initGallery() {
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let cases = [], index = 0, sequence = 0;
  const player = scenePlayer($('ascii-canvas'), state => {
    $('motion-toggle').disabled = recording || !state.available;
    $('motion-reset').disabled = recording || !state.available;
    $('motion-toggle').textContent = state.playing ? '暂停动画' : '播放动画';
    $('motion-toggle').setAttribute('aria-pressed', String(state.playing));
  });
  let recording = false, videoURL = null;
  function downloadReady(available) {
    $('download').disabled = !available || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream;
    $('video-file').hidden = true;
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    $('export-status').textContent = '';
  }
  function showScene(next, updateHistory = false, focus = false) {
    if (recording) return;
    index = next;
    const item = cases[index], token = ++sequence;
    player.load(null, true);
    $('stage').hidden = true;
    $('image-status').hidden = false;
    $('image-status').textContent = '正在载入这幅作品…';
    $('work-title').textContent = item.title;
    $('work-base').textContent = `${LABELS[item.base] || '点阵风景'} / ${item.base || item.id}`;
    $('position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(cases.length).padStart(2, '0')}`;
    $('work-description').textContent = typeof item.description === 'string' ? item.description : '';
    $('ascii-canvas').setAttribute('aria-label', item.title + (item.description ? `：${item.description}` : '，字符点阵动画'));
    $('motion-label').textContent = '正在生成字符帧…';
    downloadReady(false);
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
    loadPiece(item).then(piece => {
      if (token !== sequence) return;
      $('stage').hidden = false;
      $('image-status').hidden = true;
      player.load(piece, reduced.matches || document.hidden);
      downloadReady(true);
      $('motion-label').textContent = `${piece.meta.cols}×${piece.meta.rows} · ${piece.meta.fps} fps · ${piece.meta.palette.length} 色字符动画`;
      if (focus) {
        $('work-title').focus({ preventScroll: true });
        $('current-work').scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    }).catch(error => {
      if (token === sequence) $('image-status').textContent = `字符动画未能生成：${error.message}`;
    });
  }

  function buildCards() {
    $('cards').replaceChildren(...cases.map((item, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'card'; button.dataset.id = item.id;
      button.setAttribute('aria-label', `查看${item.title}`);
      const preview = document.createElement('span'); preview.className = 'thumbnail';
      const status = document.createElement('span'); status.className = 'thumbnail-status'; status.textContent = '字符帧生成中';
      preview.append(status);
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true'); preview.append(canvas);
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        loadPiece(item).then(piece => {
          status.hidden = true;
          thumbnailFrame(canvas, piece);
        }).catch(() => { status.textContent = '字符帧未能生成'; });
      }, { rootMargin: '100px' });
      observer.observe(button);
      const caption = document.createElement('span'); caption.className = 'card-caption';
      const title = document.createElement('span'); title.className = 'card-title'; title.textContent = item.title;
      const base = document.createElement('span'); base.className = 'card-base'; base.textContent = item.base || '';
      caption.append(title, base); button.append(preview, caption);
      button.addEventListener('click', () => showScene(i, true, true));
      return button;
    }));
  }
  $('download').addEventListener('click', async () => {
    if (recording) return;
    recording = true;
    const item = cases[index];
    const controls = [...document.querySelectorAll('button')];
    const disabled = controls.map(button => button.disabled);
    controls.forEach(button => button.disabled = true);
    $('export-status').textContent = '正在录制播放器的实际字符画面，请保持此页可见…';
    $('stage').scrollIntoView({ block: 'center' });
    player.dispatch({ type: 'play' });
    try {
      const blob = await recordVideo($('ascii-canvas'), 5);
      videoURL = URL.createObjectURL(blob);
      const link = $('video-file'); link.href = videoURL;
      link.download = `${item.id}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
      link.textContent = '保存刚录制的 5 秒动画 ↗'; link.hidden = false;
      $('export-status').textContent = '录制完成，视频与上方播放器使用同一字符画面。';
    } catch (error) { $('export-status').textContent = `录制失败：${error.message}`; }
    finally { recording = false; controls.forEach((button, i) => button.disabled = disabled[i]); }
  });
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
