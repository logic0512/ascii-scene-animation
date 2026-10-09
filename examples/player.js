import { mount } from './mount.js';

export function scenePlayer(canvas, changed) {
  let piece = null, stop = () => {}, elapsed = 0, playing = false;
  function start() {
    stop();
    if (!piece) { changed({ available: false, playing: false }); return; }
    const from = elapsed, frame = piece.default();
    const controlled = { meta: piece.meta, default: () => (time, env) => {
      elapsed = from + time;
      const at = Math.floor(elapsed * piece.meta.fps) / piece.meta.fps;
      canvas.dataset.time = at.toFixed(3);
      return frame(at, env);
    } };
    stop = mount(canvas, controlled, { fps: playing ? piece.meta.fps : 0, motion: true });
    changed({ available: true, playing });
  }
  return {
    load(next, reduced) { stop(); piece = next; elapsed = 0; playing = Boolean(next && !reduced); start(); },
    dispatch(action) {
      if (action.type === 'toggle') playing = Boolean(piece && !playing);
      if (action.type === 'play') playing = Boolean(piece);
      if (action.type === 'pause') playing = false;
      if (action.type === 'reset') { elapsed = 0; playing = false; }
      start();
    }
  };
}

export async function recordVideo(canvas, seconds) {
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('浏览器不支持录制，请在现代浏览器中打开。');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('浏览器没有可用的视频编码器。');
  const stream = canvas.captureStream(15), chunks = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
  try {
    return await new Promise((resolve, reject) => {
      let hidden = false;
      const interrupt = () => { if (document.hidden) { hidden = true; recorder.stop(); } };
      const timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, seconds * 1000);
      const cleanup = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', interrupt); };
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { cleanup(); reject(new Error('视频编码失败。')); };
      recorder.onstop = () => {
        cleanup();
        if (hidden) reject(new Error('页面隐藏导致录制中断，请保持此页可见后重试。'));
        else if (!chunks.length) reject(new Error('没有收到视频帧。'));
        else resolve(new Blob(chunks, { type: mimeType }));
      };
      document.addEventListener('visibilitychange', interrupt);
      recorder.start();
    });
  } finally { stream.getTracks().forEach(track => track.stop()); }
}
