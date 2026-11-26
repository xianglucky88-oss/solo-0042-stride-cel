import { interpolate } from './interpolate.mjs';
import { orientPose } from './orientation.mjs';

// A voiced event keeps its source moment and frame slot; it only gains the
// world root position at that moment, key poses between frames included.
export function audible(events, keys, facing) {
  return events.map(event => {
    if (!event.sound) return event;
    const { x, y } = orientPose(interpolate(keys, event.time), facing);
    return { ...event, position: { x, y } };
  });
}
