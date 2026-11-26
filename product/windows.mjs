import { offsetFor } from './adjustments.mjs';
import { worldBox } from './orientation.mjs';

export function activeWindows(windows, adjustments, index, fps, pose, facing) {
  // Compare integers at the boundary rather than rounding a frame time.
  const numerator = index * 1000;
  const time = numerator/fps;
  return windows.filter(row => row.from*fps <= numerator && numerator < row.to*fps)
    .map(row => {
      // The stored nudge is relative to the character root, so mirroring the
      // sheet also mirrors the nudge instead of freezing a canvas coordinate.
      const { dx, dy } = offsetFor(adjustments, row.id, time);
      return worldBox({ ...row, x:row.x+dx, y:row.y+dy }, pose, facing);
    });
}

export function unsampled(windows, frames) {
  const used = new Set(frames.flatMap(frame => frame.boxes.map(box => box.id)));
  return windows.filter(window => !used.has(window.id)).map(window => window.id);
}
