import { eventFrame } from './frame-clock.mjs';

export function schedule(events, fps) {
  const slots = new Map();
  for (const event of events) {
    const index = eventFrame(event.time,fps);
    if (!slots.has(index)) slots.set(index, []);
    slots.get(index).push({ ...event, offset: event.time - index*1000/fps });
  }
  return slots;
}
