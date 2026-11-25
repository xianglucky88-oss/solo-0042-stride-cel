import { orientPose } from './orientation.mjs';

export function continuity(document) {
  const { keys, facing, loop } = document;
  const a = orientPose(keys[0], facing), b = orientPose(keys.at(-1), facing);
  const cycleTravel = { x:b.x-a.x, y:b.y-a.y };
  const angularJump = Math.abs(((b.arm-a.arm+540)%360)-180);
  // Horizontal travel should accumulate, not be interpreted as a visual jump.
  return { cycleTravel, angularJump, verticalJump:Math.abs(cycleTravel.y),
    loopClean:loop ? angularJump<=2 && Math.abs(cycleTravel.y)<=1 : null };
}
