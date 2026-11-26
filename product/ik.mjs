// 两截手臂 IK 的具名导出入口，便于脚本/检查直接复用几何解算。
export { solveChain, angleDirection, mirrorPoint, rotatedCorners } from './arm.mjs';
import { solveChain } from './arm.mjs';

export const solveIK = solveChain;
export const twoBoneIK = solveChain;
export const solveElbow = solveChain;

// 便捷封装：给定肩、托架（腕目标）与两截长度，返回肘点或不可达错误。
export function elbowPoint(shoulder, target, upper, fore, side = 1, fallbackDirection = { x: 1, y: 0 }) {
  const result = solveChain(shoulder, target, upper, fore, side, fallbackDirection);
  if (!result.reachable) {
    const error = new Error(`手臂不可达：d=${result.d.toFixed(3)}`);
    error.code = 'UNREACHABLE';
    error.distance = result.d;
    throw error;
  }
  return result.elbow;
}
