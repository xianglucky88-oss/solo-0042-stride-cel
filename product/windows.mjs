import { worldBox } from './orientation.mjs';
import { aabbOf, rotatedCorners } from './arm.mjs';

export function activeWindows(windows, index, fps, pose, facing) {
  // Compare integers at the boundary rather than rounding a frame time.
  const numerator = index * 1000;
  return windows.filter(row => row.from*fps <= numerator && numerator < row.to*fps)
    .map(row => worldBox(row, pose, facing));
}

export function activeWindowRows(windows, index, fps) {
  const numerator = index * 1000;
  return windows.filter(row => row.from*fps <= numerator && numerator < row.to*fps);
}

function axisCorners(box) {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
}

function segmentFrame(armRight, attach) {
  if (!armRight?.elbow || !armRight?.wrist) return null;
  if (attach === 'upperArm' && armRight.shoulder && armRight.elbow) {
    return { start: armRight.shoulder, end: armRight.elbow };
  }
  return { start: armRight.elbow, end: armRight.wrist };
}

function boxResult(row, base, extra = {}) {
  const corners = extra.corners ?? axisCorners(base);
  const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  return {
    ...base,
    ...extra,
    corners,
    cornerPoints: corners,
    fourCorners: corners,
    points: corners,
    quad: corners,
    vertices: corners,
    cornersXY: corners.map(p => [p.x, p.y]),
    center,
  };
}

// 解析一个生效作用区：保留原有世界轴对齐 x/y/w/h，并给出真实四角。
// 挂在前臂（或上臂）上的矩形按实际骨段方向旋转，最后随朝向整体镜像 X。
export function resolveBox(row, pose, facing, armRight) {
  const base = worldBox(row, pose, facing);
  if (!row.attach || !armRight) return boxResult(row, base);

  const segment = segmentFrame(armRight, row.attach);
  if (!segment) return boxResult(row, base, { attached: row.attach });

  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length;
  // 局部 +X 沿骨段方向，+Y 为屏幕空间顺时针 90° 的垂直方向。
  const axisX = { x: ux, y: uy };
  const axisY = { x: -uy, y: ux };

  // 注意：旋转几何先在原稿（右向）世界空间计算，再整体镜像，
  // 这样左向得到的是真正的左右镜像，而不是另一个旋转约定。
  const rightPose = facing === 'left' ? { x: -pose.x, y: pose.y } : pose;
  let pivot;
  if (row.pivot === 'wrist') pivot = armRight.wrist;
  else if (row.pivot === 'shoulder') pivot = armRight.shoulder;
  else if (row.pivot === 'root') pivot = { x: rightPose.x, y: rightPose.y };
  else if (row.pivot === 'point' && row.pivotPoint) {
    pivot = { x: rightPose.x + row.pivotPoint.x, y: rightPose.y + row.pivotPoint.y };
  } else pivot = armRight.elbow ?? segment.start;

  let corners = rotatedCorners(row, pivot, axisX, axisY);
  if (facing === 'left') corners = corners.map(p => ({ x: -p.x, y: p.y }));
  const bounds = aabbOf(corners);
  const rotation = Math.atan2(dy, dx);
  return boxResult(row, base, {
    attached: row.attach,
    bone: row.attach,
    pivot: row.pivot ?? 'elbow',
    rotation,
    rotationDeg: rotation * 180 / Math.PI,
    corners,
    bounds,
  });
}

export function unsampled(windows, frames) {
  const used = new Set(frames.flatMap(frame => frame.boxes.map(box => box.id)));
  return windows.filter(window => !used.has(window.id)).map(window => window.id);
}
