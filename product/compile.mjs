import { frameCount, frameTime } from './frame-clock.mjs';
import { interpolate } from './interpolate.mjs';
import { orientPose } from './orientation.mjs';
import { schedule } from './dispatch.mjs';
import { audible } from './audible.mjs';
import { activeWindows, unsampled } from './windows.mjs';
import { continuity } from './continuity.mjs';

export function compile(document) {
  const { fps, duration, facing, keys, windows, events } = document;
  const slots = schedule(audible(events, keys, facing), fps);
  const frames = Array.from({length:frameCount(duration,fps)}, (_,index) => {
    const time = frameTime(index,fps);
    const pose = orientPose(interpolate(keys,time),facing);
    return { index,time,pose,boxes:activeWindows(windows,index,fps,pose,facing),events:slots.get(index) ?? [] };
  });
  return { id:document.id, fps, duration, facing, loop:document.loop, frames, continuity:continuity(document), unsampled:unsampled(windows,frames) };
}
