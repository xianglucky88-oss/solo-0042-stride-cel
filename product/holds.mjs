// Hit-stop holds freeze the action clock at a chosen tick while the game
// clock keeps running. Each span records the game-time interval [reach,
// resume) during which the action sits at the held tick.

export function holdSpans(holds) {
  const spans = [];
  let shift = 0;
  for (const hold of holds) {
    spans.push({ at: hold.at, reach: hold.at + shift, resume: hold.at + shift + hold.duration });
    shift += hold.duration;
  }
  return spans;
}

export function heldTime(spans) {
  return spans.reduce((sum, span) => sum + span.resume - span.reach, 0);
}

// Action tick shown at a frame start, as an exact fraction: tick = result / fps.
// `game` is the frame start on the game clock in the same units (game ms × fps).
export function frameTick(game, fps, spans) {
  let shift = 0;
  for (const span of spans) {
    if (game < span.reach * fps) break;
    if (game < span.resume * fps) return span.at * fps;
    shift += span.resume - span.reach;
  }
  return game - shift * fps;
}

// Game time at which an action-clock event written at `tick` fires. An event
// on a held tick waits for the resume instead of firing when the hold starts.
export function eventGameTime(tick, spans) {
  let shift = 0;
  for (const span of spans) if (span.at <= tick) shift += span.resume - span.reach;
  return tick + shift;
}
