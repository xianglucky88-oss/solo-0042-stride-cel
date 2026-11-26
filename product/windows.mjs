import { worldBox } from './orientation.mjs';

export function activeWindows(windows, tick, fps, pose, facing) {
  // Compare integers at the boundary rather than rounding a frame time.
  // `tick` is the frame's action tick scaled by fps, so holds freeze it.
  return windows.filter(row => row.from*fps <= tick && tick < row.to*fps)
    .map(row => worldBox(row, pose, facing));
}

export function unsampled(windows, frames) {
  const used = new Set(frames.flatMap(frame => frame.boxes.map(box => box.id)));
  return windows.filter(window => !used.has(window.id)).map(window => window.id);
}
