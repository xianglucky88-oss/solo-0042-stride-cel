import { eventFrame } from './frame-clock.mjs';
import { eventGameTime } from './holds.mjs';

export function schedule(events, fps, spans = []) {
  // Sheets that use holds or explicit clocks mark every event with its clock
  // so the engine can tell which time axis `time` was written on.
  const clocked = spans.length > 0 || events.some(event => event.clock !== undefined);
  const slots = new Map();
  for (const event of events) {
    const clock = event.clock ?? 'action';
    // Game-clock events fire at their written game time; action-clock events
    // ride the action clock and wait out any hold sitting on their tick.
    const actual = clock === 'game' ? event.time : eventGameTime(event.time, spans);
    const index = eventFrame(actual, fps);
    if (!slots.has(index)) slots.set(index, []);
    slots.get(index).push({ actual, delivered: { ...event, ...(clocked ? { clock } : {}), offset: actual - index*1000/fps } });
  }
  const result = new Map();
  for (const [index, slot] of slots) {
    slot.sort((a,b) => a.actual-b.actual || a.delivered.id.localeCompare(b.delivered.id));
    result.set(index, slot.map(entry => entry.delivered));
  }
  return result;
}
