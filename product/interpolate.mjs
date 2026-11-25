export function interpolate(keys, time) {
  let i = 1;
  while (i < keys.length - 1 && keys[i].time < time) i++;
  const before = keys[i-1], after = keys[i];
  const t = Math.max(0, Math.min(1, (time-before.time)/(after.time-before.time)));
  const lerp = field => before[field] + (after[field]-before[field])*t;
  return { x:lerp('x'), y:lerp('y'), arm:lerp('arm') };
}
