// One-shot audible pass over a proof: each voiced event fires the built-in
// 150 ms mono tone at its own source moment, panned by its world X.
const TONE = 0.15;   // seconds
const SPREAD = 40;   // px from the listening center to a single-channel side
const LEAD = 0.08;   // seconds of scheduling headroom before the first sound

export function panFor(x) {
  return Math.max(-1, Math.min(1, x / SPREAD));
}

export function audition(sheet, fromIndex, { tick, end } = {}) {
  const context = new AudioContext();
  void context.resume().catch(() => {});
  const startTime = sheet.frames[fromIndex].time;
  const origin = context.currentTime + LEAD;
  const sources = new Set();
  let lastEnd = origin, raf = 0, done = false;

  // Sounds are booked on the audio clock up front, so a busy main thread
  // cannot push a footstep late; each tail keeps the pan of its trigger spot.
  for (const frame of sheet.frames) {
    for (const event of frame.events) {
      if (!event.sound || event.time + 1e-6 < startTime) continue;
      const when = origin + (event.time - startTime) / 1000;
      const osc = context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 540;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(0.85, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, when + TONE);
      const pan = context.createStereoPanner();
      pan.pan.value = panFor(event.position.x);
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(context.destination);
      osc.start(when);
      osc.stop(when + TONE);
      osc.onended = () => sources.delete(osc);
      sources.add(osc);
      lastEnd = Math.max(lastEnd, when + TONE);
    }
  }

  const times = sheet.frames.map(frame => frame.time);
  const frameAt = now => {
    let index = 0;
    while (index + 1 < times.length && times[index + 1] <= now) index++;
    return index;
  };
  let shown = -1;
  function pump() {
    if (done) return;
    const now = startTime + Math.max(0, context.currentTime - origin) * 1000;
    if (now >= sheet.duration) return finish();
    const next = frameAt(now);
    if (next !== shown) { shown = next; tick?.(next); }
    raf = requestAnimationFrame(pump);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    tick?.(sheet.frames.length - 1);
    end?.();
    // Let triggered tails ring out, then release the context.
    setTimeout(() => void context.close(), Math.max(0, (lastEnd - context.currentTime) * 1000) + 60);
  }

  function stop() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    for (const osc of sources) { try { osc.stop(); } catch { /* already silent */ } }
    sources.clear();
    void context.close();
  }

  const watchdog = setTimeout(finish, sheet.duration - startTime + 800);
  raf = requestAnimationFrame(pump);
  return stop;
}
