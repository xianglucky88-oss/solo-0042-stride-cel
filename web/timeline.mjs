import { el } from './dom.mjs';
import { continuousView, singleView } from './playback.mjs';

// Proof playback. In continuous mode the playhead is a wall-clock position and
// each lap begins where the previous lap actually ended; the exported artifact
// is untouched. Pausing or scrubbing keeps the current lap, and only an
// explicit restart returns to the first lap.

export function timeline(stage, sheet, update) {
  const bar = el('div', undefined, 'transport');
  const play = el('button', '▶'), restart = el('button', '⟲'),
    slider = el('input'), counter = el('span', undefined, 'mono');
  const modes = el('div', undefined, 'mode-switch');
  let mode = sheet.loop ? 'continuous' : 'single';
  let globalMs = 0, lap = 0, singleIndex = 0, playing = false, anchorAt = 0, anchorBase = 0, timer;
  const lastFrame = sheet.frames.length - 1;

  play.type = 'button'; play.setAttribute('aria-label', '播放'); play.title = '播放或暂停';
  restart.type = 'button'; restart.setAttribute('aria-label', '回到第一圈开头'); restart.title = '重新从头播放';
  slider.type = 'range'; slider.min = 0; slider.max = lastFrame; slider.value = 0;
  slider.setAttribute('aria-label', '当前采样帧');

  const strip = el('div', undefined, 'frame-strip');
  strip.setAttribute('aria-label', '作用区与事件帧');
  const tiles = sheet.frames.map(frame => {
    const box = el('span');
    box.dataset.kind = frame.events.length ? 'event' : frame.boxes.length ? 'active' : 'idle';
    box.title = `帧 ${frame.index} · ${frame.events.map(e => e.id).join('、') || (frame.boxes.length ? '作用区开启' : '无事件')}`;
    return box;
  });
  strip.append(...tiles);

  const modeButtons = new Map();
  if (sheet.loop) {
    modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '循环校样模式');
    for (const [id, text, title] of [['single', '单圈', '只播放一圈，即导出帧表的样子'],
      ['continuous', '连续行进', '每圈从前一圈实际终点接着走']]) {
      const button = el('button', text);
      button.type = 'button'; button.title = title;
      button.addEventListener('click', () => setMode(id));
      modeButtons.set(id, button); modes.append(button);
    }
  }

  bar.append(play, restart, modes, slider, counter);
  stage.append(strip, bar);

  function currentView() {
    return mode === 'continuous' ? continuousView(sheet, globalMs) : singleView(sheet, singleIndex);
  }

  function setMode(next) {
    if (next === mode) return;
    const at = currentView();
    mode = next;
    if (mode === 'continuous') {
      // Keep the lap count; pick up inside it from the frame on screen.
      setGlobal(lap * sheet.duration + sheet.frames[at.index].time);
    } else {
      singleIndex = at.index;
    }
    if (playing) rebase();
    paint();
  }

  function setGlobal(value) {
    globalMs = Math.max(0, value);
    lap = Math.floor(globalMs / sheet.duration + 1e-7);
    if (playing) rebase();
  }

  function rebase() {
    anchorAt = performance.now();
    anchorBase = mode === 'continuous' ? globalMs : singleIndex;
  }

  function paint() {
    const at = currentView(), index = at.index;
    for (const tile of tiles) tile.removeAttribute('data-current');
    tiles[index]?.setAttribute('data-current', 'true');
    slider.value = index;
    counter.textContent = mode === 'continuous'
      ? `第 ${at.lap + 1} 圈 · ${Math.round(at.inLap)} / ${sheet.duration} ms`
      : `${index + 1} / ${sheet.frames.length}`;
    for (const [id, button] of modeButtons) button.setAttribute('aria-pressed', String(id === mode));
    restart.disabled = at.lap === 0 && at.inLap === 0;
    update(at);
  }

  function commitElapsed() {
    const elapsed = performance.now() - anchorAt;
    if (mode === 'continuous') {
      globalMs = anchorBase + elapsed;
      lap = Math.floor(globalMs / sheet.duration + 1e-7);
    } else {
      singleIndex = Math.min(lastFrame, anchorBase + Math.floor(elapsed * sheet.fps / 1000));
    }
  }

  function stop() {
    clearTimeout(timer); timer = undefined; playing = false;
    play.textContent = '▶'; play.setAttribute('aria-label', '播放');
  }

  function tick() {
    if (!playing) return;
    commitElapsed();
    paint();
    if (mode === 'single' && singleIndex >= lastFrame) {
      // The single-lap view keeps the artifact's own wrap, seam jump included.
      if (!sheet.loop) return stop();
      singleIndex = 0; rebase();
    }
    timer = setTimeout(tick, Math.max(8, 1000 / sheet.fps));
  }

  slider.oninput = () => {
    const index = Number(slider.value);
    if (mode === 'continuous') {
      // Scrubbing stays inside the current lap and never changes the lap count.
      setGlobal(lap * sheet.duration + sheet.frames[index].time);
    } else {
      singleIndex = index;
      if (playing) rebase();
    }
    paint();
  };

  restart.onclick = () => {
    lap = 0; globalMs = 0; singleIndex = 0;
    if (playing) rebase();
    paint();
  };

  play.onclick = () => {
    if (playing) { commitElapsed(); stop(); paint(); return; }
    if (mode === 'single' && singleIndex >= lastFrame) singleIndex = 0;
    playing = true; rebase();
    play.textContent = 'Ⅱ'; play.setAttribute('aria-label', '暂停');
    timer = setTimeout(tick, Math.max(8, 1000 / sheet.fps));
  };

  if (mode === 'continuous') {
    globalMs = sheet.frames[Math.floor(sheet.frames.length * .35)].time;
  } else {
    singleIndex = Math.floor(sheet.frames.length * .35);
  }
  paint();
  return stop;
}
