import { frameCount, frameTime } from './frame-clock.mjs';
import { interpolate } from './interpolate.mjs';
import { orientPose } from './orientation.mjs';
import { schedule } from './dispatch.mjs';
import { activeWindows, activeWindowRows, resolveBox, unsampled } from './windows.mjs';
import { continuity } from './continuity.mjs';
import { InputError } from '../server/input.mjs';
import { armFrameFields, armSheetDescriptor, evaluateArm, hasArmDraft, normalizeArm, orientArm } from './arm.mjs';

function unreachableError(config, failures) {
  const first = failures[0];
  const indices = failures.map(item => item.index);
  const message = `第${first.index}帧（frame ${first.index}，采样时刻 ${first.time.toFixed(1)} ms）交接不可达：`
    + `握点「${config.grip}」的肩腕距离 ${first.distance.toFixed(3)} px，`
    + `两截手臂展长 ${(config.upper + config.fore).toFixed(3)} px，够不到托架`
    + (failures.length > 1 ? `；不可达帧：${indices.join(', ')}` : '');
  return new InputError(message, 422, {
    code: 'HANDOFF_UNREACHABLE',
    frame: first.index,
    index: first.index,
    frameIndex: first.index,
    frameNumber: first.index + 1,
    time: first.time,
    grip: config.grip,
    unreachableFrames: indices,
    frames: indices,
    distance: first.distance,
    maxReach: config.upper + config.fore,
  });
}

export function compile(document) {
  const { fps, duration, facing, keys } = document;
  const windows = document.windows ?? [];
  const events = document.events ?? [];
  // 路由总是先 normalize；这里再过一次手臂适配（对已规范配置是幂等的），
  // 也兼容直接把原始（近义字段）草稿交给 compile 的脚本。
  const armConfig = hasArmDraft(document) ? normalizeArm(document, duration, keys) : null;
  const slots = schedule(events, fps);
  const count = frameCount(duration, fps);

  // 先在原稿（右向）空间解算整条手臂；交接不可达时直接指出帧，不产出假装握住的表。
  let armStates = null;
  if (armConfig) {
    armStates = [];
    const failures = [];
    for (let index = 0; index < count; index++) {
      const time = frameTime(index, fps);
      const raw = interpolate(keys, time);
      const arm = evaluateArm(armConfig, { pose: raw, keys, time, index, fps });
      armStates.push(arm);
      if (arm.active && !arm.reachable) failures.push({ index, time, distance: arm.distance });
    }
    if (failures.length) throw unreachableError(armConfig, failures);
  }

  const frames = Array.from({ length: count }, (_, index) => {
    const time = frameTime(index, fps);
    const raw = interpolate(keys, time);
    const pose = orientPose(raw, facing);
    const base = { index, time, pose };

    if (!armConfig) {
      base.boxes = activeWindows(windows, index, fps, pose, facing);
      base.events = slots.get(index) ?? [];
      return base;
    }

    const armRight = armStates[index];
    const armOriented = orientArm(armRight, facing);
    const rows = activeWindowRows(windows, index, fps);
    base.boxes = rows.map(row => resolveBox(row, pose, facing, armRight));
    base.events = slots.get(index) ?? [];
    // 也允许从 pose 上直接读到关节与握点。
    Object.assign(pose, {
      shoulder: armOriented.shoulder,
      elbow: armOriented.elbow,
      wrist: armOriented.wrist,
      grip: armOriented.wrist ? { id: armConfig.grip, name: armConfig.grip, x: armOriented.wrist.x, y: armOriented.wrist.y } : null,
    });
    Object.assign(base, armFrameFields(armConfig, armOriented));
    return base;
  });

  const sheet = { id: document.id, fps, duration, facing, loop: document.loop, frames,
    continuity: continuity(document), unsampled: unsampled(windows, frames) };
  if (armConfig) {
    const descriptor = armSheetDescriptor(armConfig, facing);
    sheet.arm = descriptor;
    sheet.arm2d = descriptor;
    sheet.rig = descriptor;
    sheet.handoff = descriptor.handoff ? { ...descriptor.handoff, bracket: descriptor.bracket, grip: descriptor.grip } : null;
    sheet.bracket = descriptor.bracket;
    sheet.grips = [{ id: descriptor.grip, name: descriptor.grip }];
  }
  return sheet;
}
