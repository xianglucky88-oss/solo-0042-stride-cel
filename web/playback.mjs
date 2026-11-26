// Continuous-travel proof playback.
//
// The exported artifact is always a single lap. This module only decides where
// that lap's sampled root positions land while the proof is looping: each new
// lap starts where the previous lap actually ended, so horizontal travel
// accumulates instead of snapping back to the origin. Vertical pose values are
// left untouched so a real vertical jump in the source stays visible.
//
// Everything here is pure and independent of the DOM so the loop behaviour can
// be checked without a browser.

const EPSILON = 1e-7;

export function lapTravel(sheet) {
  return sheet.continuity?.cycleTravel ?? { x: 0, y: 0 };
}

// Only horizontal root travel repeats between laps. Vertical differences are
// authored motion, not travel, and must remain visible at the seam.
export function lapShift(sheet, lap) {
  return { x: lapTravel(sheet).x * lap, y: 0 };
}

export function frameIndexAt(sheet, inLapMs) {
  const raw = Math.floor((inLapMs * sheet.fps) / 1000 + EPSILON);
  return Math.max(0, Math.min(sheet.frames.length - 1, raw));
}

// Map a wall-clock position to a lap and a sampled frame inside that lap.
export function locate(sheet, globalMs) {
  const global = Math.max(0, globalMs);
  const lap = Math.floor(global / sheet.duration + EPSILON);
  const inLap = global - lap * sheet.duration;
  return { lap, inLap, index: frameIndexAt(sheet, inLap), global };
}

export function placeFrame(sheet, lap, index) {
  const frame = sheet.frames[index];
  const shift = lapShift(sheet, lap);
  return {
    lap,
    index,
    time: frame.time,
    pose: { ...frame.pose, x: frame.pose.x + shift.x },
    boxes: frame.boxes.map(box => ({ ...box, x: box.x + shift.x })),
    events: frame.events,
  };
}

export function placeAt(sheet, globalMs) {
  const at = locate(sheet, globalMs);
  return { ...at, frame: placeFrame(sheet, at.lap, at.index) };
}

// Root path across the most recent lap of travel, ending at the current
// playback position. The path never runs ahead of the playhead; just after a
// lap boundary the tail of the previous lap is still inside the window.
export function trailPoints(sheet, globalMs) {
  const end = Math.max(0, globalMs);
  const start = Math.max(0, end - sheet.duration);
  const firstLap = locate(sheet, start).lap, lastLap = locate(sheet, end).lap;
  const points = [];
  for (let lap = firstLap; lap <= lastLap; lap += 1) {
    // Frames are already sampled, so the path is piecewise straight between
    // them; each point carries the global time it was reached.
    const shift = lapShift(sheet, lap);
    for (const frame of sheet.frames) {
      const global = lap * sheet.duration + frame.time;
      if (global < start - EPSILON || global > end + EPSILON) continue;
      points.push({ x: frame.pose.x + shift.x, y: frame.pose.y, lap, index: frame.index, time: frame.time });
    }
  }
  return points;
}

// Bounds of the authored lap, used for scale and for framing single-lap proof.
export function lapExtents(sheet) {
  const xs = [], ys = [];
  for (const frame of sheet.frames) {
    xs.push(frame.pose.x - 72, frame.pose.x + 72);
    ys.push(frame.pose.y - 100, frame.pose.y + 10);
    for (const box of frame.boxes) {
      xs.push(box.x, box.x + box.w);
      ys.push(box.y, box.y + box.h);
    }
  }
  return {
    left: Math.min(...xs), right: Math.max(...xs),
    top: Math.min(-100, ...ys), bottom: Math.max(0, ...ys),
  };
}

// Proof view state for continuous mode: the character and its action boxes
// placed for the current lap, a camera that trails the character, and the
// trailing path.
export function continuousView(sheet, globalMs) {
  const at = placeAt(sheet, globalMs);
  return {
    continuous: true,
    lap: at.lap,
    inLap: at.inLap,
    index: at.index,
    pose: at.frame.pose,
    boxes: at.frame.boxes,
    events: at.frame.events,
    cameraX: cameraAt(sheet, globalMs),
    trail: trailPoints(sheet, globalMs),
  };
}

// The camera follows the character but trails it slightly. The lag is a pure
// function of the playhead, so the view stays continuous across lap seams; it
// is also clamped so a very long stride cannot push the character off-screen.
export function cameraAt(sheet, globalMs) {
  const current = placeAt(sheet, globalMs).frame.pose.x;
  const lagged = placeAt(sheet, Math.max(0, globalMs - sheet.duration / 4)).frame.pose.x;
  const limit = Math.min(Math.abs(lapTravel(sheet).x) * 0.25, 30);
  const offset = Math.max(-limit, Math.min(limit, current - lagged));
  return current - offset;
}

// Proof view state for a single authored lap. The camera is fixed on the lap
// centre so the whole lap stays on screen.
export function singleView(sheet, index) {
  const clamped = Math.max(0, Math.min(sheet.frames.length - 1, index));
  const frame = sheet.frames[clamped];
  const { left, right } = lapExtents(sheet);
  return {
    continuous: false,
    lap: 0,
    inLap: frame.time,
    index: clamped,
    pose: frame.pose,
    boxes: frame.boxes,
    events: frame.events,
    cameraX: (left + right) / 2,
    trail: sheet.frames.map(row => ({ x: row.pose.x, y: row.pose.y, lap: 0, index: row.index })),
  };
}
