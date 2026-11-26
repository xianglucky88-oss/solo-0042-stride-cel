import { choice, key, list, number, object, requireThat, unique } from '../server/input.mjs';
import { hasArmDraft, normalizeArm } from './arm.mjs';

function optionalNumber(value, min, max, label, fallback) {
  return value === undefined ? fallback : number(value, min, max, label);
}

function point(value, label) {
  if (Array.isArray(value) && value.length >= 2) {
    return { x: number(value[0], -10000, 10000, `${label} X`), y: number(value[1], -10000, 10000, `${label} Y`) };
  }
  object(value, label);
  return {
    x: number(value.x ?? value.px, -10000, 10000, `${label} X`),
    y: number(value.y ?? value.py, -10000, 10000, `${label} Y`),
  };
}

function optionalPoint(row, names, pair, label) {
  for (const name of names) {
    if (row[name] !== undefined) return point(row[name], label);
  }
  if (pair && row[pair[0]] !== undefined && row[pair[1]] !== undefined) {
    return point({ x: row[pair[0]], y: row[pair[1]] }, label);
  }
  return undefined;
}

function pose(row, duration) {
  object(row, '姿态');
  const result = {
    time: number(row.time, 0, duration, '姿态时间', true),
    x: optionalNumber(row.x, -1000, 1000, '根 X', 0),
    y: optionalNumber(row.y, -1000, 1000, '根 Y', 0),
    arm: optionalNumber(row.arm, -180, 180, '手臂角度', 0),
  };
  if (row.forearm !== undefined || row.forearmAngle !== undefined) {
    result.forearm = number(row.forearm ?? row.forearmAngle, -720, 720, '前臂角度');
  }
  if (row.elbowBend !== undefined || row.bendAngle !== undefined) {
    result.elbowBend = number(row.elbowBend ?? row.bendAngle, -720, 720, '肘部折角');
  }
  const shoulder = optionalPoint(row, ['shoulder'], ['sx', 'sy'], '肩位置');
  if (shoulder) result.shoulder = shoulder;
  const shoulderOffset = optionalPoint(row, ['shoulderOffset', 'shoulderDelta'], null, '肩偏移');
  if (shoulderOffset) result.shoulderOffset = shoulderOffset;
  const elbow = optionalPoint(row, ['elbow'], ['ex', 'ey'], '肘位置');
  if (elbow) result.elbow = elbow;
  const wrist = optionalPoint(row, ['wrist'], ['wx', 'wy'], '腕位置');
  if (wrist) result.wrist = wrist;
  return result;
}

function windowAttachment(row, gripName) {
  let raw = row.attach ?? row.attachment ?? row.attachedTo ?? row.bone
    ?? row.parent ?? row.follow ?? row.limb ?? row.on;
  let pivot = row.pivot ?? row.origin ?? row.pivotPoint ?? row.joint ?? row.anchorPoint;
  let pivotPoint = null;
  if (pivot && typeof pivot === 'object' && !Array.isArray(pivot)) {
    if (Number.isFinite(pivot.x) && Number.isFinite(pivot.y)) { pivotPoint = { x: pivot.x, y: pivot.y }; pivot = 'point'; }
  } else if (Array.isArray(pivot) && Number.isFinite(pivot[0]) && Number.isFinite(pivot[1])) {
    pivotPoint = { x: pivot[0], y: pivot[1] }; pivot = 'point';
  }
  // 对象形式：attach:{ bone:'forearm', pivot:'wrist' }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    pivot = pivot ?? raw.pivot ?? raw.at ?? raw.origin;
    if (pivot && typeof pivot === 'object' && Number.isFinite(pivot.x)) {
      pivotPoint = { x: pivot.x, y: pivot.y }; pivot = 'point';
    }
    raw = raw.bone ?? raw.segment ?? raw.to ?? raw.part;
  }
  let target = null;
  if (raw === true || row.forearm === true || row.attachForearm === true || row.onForearm === true) {
    target = 'forearm';
  } else if (typeof row.forearm === 'string') {
    target = 'forearm';
    pivot = pivot ?? row.forearm;
  } else if (typeof raw === 'string') {
    const word = raw.toLowerCase();
    if (/upper|上臂/.test(word)) target = 'upperArm';
    else if (/fore|lower|elbow|wrist|arm|臂/.test(word)) target = 'forearm';
    // attach:'wrist'/'elbow' 既指明挂到前臂，也把该关节作为轴心。
    if (!pivot && /^(wrist|grip|hand)$/.test(word)) pivot = 'wrist';
    if (!pivot && /^elbow$/.test(word)) pivot = 'elbow';
    if (!pivot && /^shoulder$/.test(word)) { target = target ?? 'upperArm'; pivot = 'shoulder'; }
    if (gripName && word === String(gripName).toLowerCase()) { target = 'forearm'; pivot = pivot ?? 'wrist'; }
  }
  // anchor 直接写具名握点名时也视为挂到腕/前臂。
  if (!target && typeof row.anchor === 'string' && gripName
      && row.anchor.toLowerCase() === String(gripName).toLowerCase()) {
    target = 'forearm'; pivot = pivot ?? 'wrist';
  }
  if (!target) return null;
  if (pivot === 'point' && pivotPoint) return { attach: target, pivot: 'point', pivotPoint };
  if (typeof pivot === 'string') {
    pivot = pivot.toLowerCase();
    if (pivot === 'grip' || pivot === 'hand' || (gripName && pivot === String(gripName).toLowerCase())) pivot = 'wrist';
    else if (pivot === 'pose' || pivot === 'rootposition') pivot = 'root';
    if (!['elbow', 'wrist', 'shoulder', 'root'].includes(pivot)) {
      pivot = target === 'upperArm' ? 'shoulder' : 'elbow';
    }
  } else {
    pivot = target === 'upperArm' ? 'shoulder' : 'elbow';
  }
  return { attach: target, pivot };
}

export function normalize(input) {
  object(input, '动画');
  const duration = number(input.duration, 100, 8000, '时长 ms', true);
  const keys = list(input.keys, 2, 48, '关键姿态').map(row => pose(row, duration)).sort((a,b) => a.time-b.time);
  requireThat(keys[0].time === 0 && keys.at(-1).time === duration, '须提供起点和结束关键姿态');
  requireThat(keys.every((row,i) => !i || row.time > keys[i-1].time), '关键姿态时间不得重复');
  const armConfig = hasArmDraft(input) ? normalizeArm(input, duration, keys) : null;
  const rawWindows = input.windows ?? [];
  const rawEvents = input.events ?? [];
  const windows = unique(list(rawWindows, 0, 24, '作用区').map(row => {
    object(row, '作用区');
    const from = number(row.from, 0, duration-1, '作用区起点', true);
    const normalized = { id: key(row.id), from, to: number(row.to, from+1, duration, '作用区结束', true),
      x: number(row.x,-240,240,'区域 X'), y: number(row.y,-240,240,'区域 Y'),
      w: number(row.w,1,240,'区域宽度'), h: number(row.h,1,240,'区域高度') };
    const attachment = windowAttachment(row, armConfig?.grip);
    if (attachment) Object.assign(normalized, attachment);
    return normalized;
  }), '作用区');
  const events = unique(list(rawEvents, 0, 48, '事件').map(row => {
    object(row, '事件');
    return { id: key(row.id), time: number(row.time,0,duration-1,'事件刻度',true), kind: choice(row.kind,['step','impact','effect'],'事件类型') };
  }), '事件').sort((a,b) => a.time-b.time || a.id.localeCompare(b.id));
  // 新手臂稿可能是只含 keys/arm 的最小文档：缺省项按最常见取值补齐，
  // 但显式给出的非法值（如 facing:'up'）仍然拒绝。
  const loop = input.loop === undefined ? false : input.loop;
  requireThat(typeof loop === 'boolean', 'loop 必须是布尔值');
  const facing = input.facing === undefined ? 'right' : choice(input.facing, ['left','right'], '朝向');
  const fps = input.fps === undefined ? 24 : number(input.fps,6,60,'帧率',true);
  const id = input.id === undefined ? 'untitled' : key(input.id);
  const document = { id, duration, fps, facing, loop, keys, windows, events };
  if (armConfig) document.arm = armConfig;
  return document;
}
