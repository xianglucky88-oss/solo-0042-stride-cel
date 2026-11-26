// A window nudge is scoped to the *action time* that was circled in the proof,
// stored relative to the character root. Times are the exact sampled instants
// (index*1000/fps) and are never rounded to whole milliseconds, so re-sampling
// at another frame rate tests the same real interval.
export function within(adjustment, time) {
  return adjustment.from <= time && time < adjustment.to;
}

export function offsetFor(adjustments, windowId, time) {
  // Partially overlapping spans accumulate: every span that contains the sample
  // contributes its own delta, in document order.
  let dx = 0, dy = 0;
  for (const adjustment of adjustments) {
    if (adjustment.window !== windowId || !within(adjustment, time)) continue;
    dx += adjustment.dx;
    dy += adjustment.dy;
  }
  return { dx, dy };
}
