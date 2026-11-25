import { worldBox } from './orientation.mjs';

export function activeWindows(windows, index, fps, pose, facing) {
  // Compare integers at the boundary rather than rounding a frame time.
  const numerator = index * 1000;
  return windows.filter(row => row.from*fps <= numerator && numerator < row.to*fps)
    .map(row => worldBox(row, pose, facing));
}

export function unsampled(windows, frames) {
  const used = new Set(frames.flatMap(frame => frame.boxes.map(box => box.id)));
  return windows.filter(window => !used.has(window.id)).map(window => window.id);
}
