import { frameCount, frameTime } from './frame-clock.mjs';
import { interpolate } from './interpolate.mjs';
import { orientPose } from './orientation.mjs';
import { schedule } from './dispatch.mjs';
import { activeWindows, unsampled } from './windows.mjs';
import { continuity } from './continuity.mjs';
import { frameTick, heldTime, holdSpans } from './holds.mjs';

export function compile(document) {
  const { fps, duration, facing, keys, windows, events } = document;
  const holds = document.holds ?? [];
  const spans = holdSpans(holds);
  const slots = schedule(events, fps, spans);
  // Holds stretch the action on the game clock; the short last frame still
  // belongs to the sheet and no endpoint frame is added.
  const frames = Array.from({length:frameCount(duration+heldTime(spans),fps)}, (_,index) => {
    const time = frameTime(index,fps);
    const tick = frameTick(index*1000,fps,spans);
    const pose = orientPose(interpolate(keys,tick/fps),facing);
    return { index, time, ...(holds.length ? { at:tick/fps } : {}), pose,
      boxes:activeWindows(windows,tick,fps,pose,facing), events:slots.get(index) ?? [] };
  });
  return { id:document.id, fps, duration, facing, loop:document.loop, ...(holds.length ? { holds } : {}),
    frames, continuity:continuity(document), unsampled:unsampled(windows,frames) };
}
