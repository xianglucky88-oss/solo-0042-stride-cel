import { InputError, requireThat, number, key } from '../server/input.mjs';

// 二维肩-肘-腕手臂：草稿适配、两截定长 IK、朝向镜像与帧产物装配。
// 输入侧保留大量近义字段名，输出侧在稳定字段之外提供常见别名，
// 以便不同草稿写法都能描述同一条手臂。

const ARM_CONTAINER_KEYS = [
  'arm', 'arm2d', 'arm2D', 'armRig', 'armSetup', 'armDefinition', 'rig',
  'limb', 'armChain', 'chain', 'ikArm', 'ikChain', 'ik', 'skeleton',
  'carry', 'carryHandoff', 'grasp', 'gripRig', 'pickup',
];
const HANDOFF_KEYS = [
  'handoff', 'handOff', 'handover', 'handOver', 'transfer',
  'delivery', 'give', 'dockWindow', 'gripWindow',
];
const BRACKET_KEYS = [
  'bracket', 'rack', 'holster', 'dock', 'mount', 'cradle', 'rest',
  'stand', 'holder', 'support', 'tray', 'socket', 'receptacle',
  'pedestal', 'fixture', 'target', 'targetPoint', 'anchorPoint',
  'anchorWorld', 'goal', 'place', 'station',
];
const POINT_NEST_KEYS = ['position', 'pos', 'location', 'world', 'at', 'point', 'coords', 'value'];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function asPoint(value) {
  if (Array.isArray(value) && value.length >= 2 &&
      Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    return { x: value[0], y: value[1] };
  }
  if (isObject(value)) {
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) return { x: value.x, y: value.y };
    if (Number.isFinite(value.px) && Number.isFinite(value.py)) return { x: value.px, y: value.py };
    if (Number.isFinite(value.dx) && Number.isFinite(value.dy)) return { x: value.dx, y: value.dy };
    for (const nested of POINT_NEST_KEYS) {
      const point = asPoint(value[nested]);
      if (point) return point;
    }
  }
  return null;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const INTERVAL_KEYS = [
  'handoffWindow', 'handoverWindow', 'window', 'phase', 'interval',
  'timing', 'schedule', 'range', 'span',
];
const NAMED_POINT_LISTS = [
  'props', 'targets', 'markers', 'locators', 'sockets', 'mounts',
  'brackets', 'racks', 'anchors', 'worldPoints', 'namedPoints',
];

// 从原始文档里找出所有可能承载手臂/交接设置的对象，按优先级排列。
const FUZZY_SCOPE = /arm|rig|limb|handoff|handover|transfer|grasp|carry|grip|socket|bracket|rack|holster|dock|skeleton|ikarm|ikchain/i;
function scopesOf(input) {
  const scopes = [];
  const seen = new Set();
  const add = scope => {
    if (isObject(scope) && !seen.has(scope)) { seen.add(scope); scopes.push(scope); }
  };
  for (const name of [...ARM_CONTAINER_KEYS, ...HANDOFF_KEYS, ...INTERVAL_KEYS, ...BRACKET_KEYS]) {
    add(input[name]);
  }
  add(input.arm?.handoff);
  add(input.handoff);
  // 容错：任何命名相近的顶层对象（propHandoff、armSetup2、dockStation…）也纳入。
  for (const [key, value] of Object.entries(input)) {
    if (FUZZY_SCOPE.test(key) && isObject(value)) add(value);
  }
  // 再展开一层常见嵌套（dock.socket、arm.timing、handoff.target …）。
  const nestedKeys = ['handoff', 'handover', 'ik', 'target', 'goal', 'timing', 'window',
    ...BRACKET_KEYS, ...INTERVAL_KEYS];
  for (const scope of [...scopes]) {
    for (const name of nestedKeys) add(scope[name]);
  }
  add(input);
  return scopes;
}

export function hasArmDraft(input) {
  if (!isObject(input)) return false;
  if (ARM_CONTAINER_KEYS.some(k => isObject(input[k]))) return true;
  if (HANDOFF_KEYS.some(k => isObject(input[k]))) return true;
  if (Array.isArray(input.grips) && input.grips.length) return true;
  if (BRACKET_KEYS.some(k => asPoint(input[k]))) return true;
  // 命名相近的对象块，或复数交接段列表。
  for (const [key, value] of Object.entries(input)) {
    if (FUZZY_SCOPE.test(key)) {
      if (isObject(value)) return true;
      if (Array.isArray(value) && /handoff|handover|transfer/i.test(key) && value.length) return true;
    }
  }
  return false;
}

// 托架也可能放在具名世界点列表里，再用 *Id/ref 字段引用。
function resolveNamedBracket(input, scopes, find) {
  const direct = findPoint(scopes, BRACKET_KEYS.concat(
    ['at', 'position', 'pos', 'point', 'location', 'world']));
  if (direct) return direct;
  const ref = find(['bracketId', 'rackId', 'holsterId', 'targetId', 'socketId',
    'mountId', 'ref', 'bracketRef', 'targetRef']);
  for (const listName of NAMED_POINT_LISTS) {
    const list = input[listName];
    if (!Array.isArray(list)) continue;
    let row;
    if (ref !== undefined) {
      row = list.find(item => isObject(item) && (item.id === ref || item.name === ref));
    }
    if (!row && (listName === 'brackets' || listName === 'racks' || listName === 'sockets')) {
      row = list[0];
    }
    if (!row) {
      row = list.find(item => isObject(item) && /bracket|rack|holster|dock|托架/.test(`${item.id ?? ''}${item.name ?? ''}`));
    }
    const point = asPoint(row);
    if (point) return point;
  }
  return null;
}

function makeFinder(scopes) {
  return function findValue(keys) {
    for (const scope of scopes) {
      for (const name of keys) {
        if (scope[name] !== undefined) return scope[name];
      }
    }
    return undefined;
  };
}

function findPoint(scopes, keys) {
  // 逐个候选名/作用域尝试，跳过同名但类型不符的字段
  // （例如交接窗里的 to 是结束时间，不是托架点）。
  for (const scope of scopes) {
    for (const name of keys) {
      const point = asPoint(scope[name]);
      if (point) return point;
    }
  }
  return null;
}

function parseSide(value) {
  if (value === undefined || value === null || value === '') return { side: 1, bend: 'below' };
  if (typeof value === 'number' && Number.isFinite(value)) {
    const side = value < 0 ? -1 : 1;
    return { side, bend: side > 0 ? 'below' : 'above' };
  }
  if (typeof value === 'boolean') return { side: value ? 1 : -1, bend: value ? 'below' : 'above' };
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase().replace(/[\s_-]/g, '');
    const below = ['below', 'down', 'downward', 'under', 'underside', 'lower', 'low', 'lowerside',
      'bottom', 'south', 'right', 'clockwise', 'positive', 'plus', 'inner', 'in', 'front'];
    const above = ['above', 'up', 'upward', 'over', 'upper', 'upperside', 'high', 'top',
      'north', 'left', 'counterclockwise', 'negative', 'minus', 'outer', 'out', 'back'];
    if (below.includes(word)) return { side: 1, bend: 'below' };
    if (above.includes(word)) return { side: -1, bend: 'above' };
    if (/^[+]?1$/.test(word)) return { side: 1, bend: 'below' };
    if (/^-1$/.test(word)) return { side: -1, bend: 'above' };
  }
  // 显式给出却无法识别的侧向按非法输入拒绝；缺省（undefined）才用下侧。
  throw new InputError(`肘弯侧向无法识别：${JSON.stringify(value)}（请用 below/down、above/up 或 ±1）`);
}

function readLengthPair(find, normalizedKeys) {
  const upperKeys = ['upper', 'upperLength', 'upperArmLen', 'upperArmLength', 'upperSize',
    'upperLen', 'upperArmSize', 'upperArm', 'humerus', 'l1', 'L1', 'bone1', 'seg1',
    'segment1', 'firstLength', 'lengthA', 'len1', 'a', 'shoulderToElbow', 'seLength'];
  const foreKeys = ['fore', 'foreLength', 'forearmLength', 'forearmLen', 'foreArmLength',
    'forearmSize', 'foreLen', 'lowerLen', 'forearm', 'foreArm', 'lower', 'lowerLength',
    'lowerArmLength', 'lowerArm', 'l2', 'L2', 'bone2', 'seg2', 'segment2',
    'secondLength', 'lengthB', 'len2', 'b', 'elbowToWrist', 'ewLength'];
  let upper = find(upperKeys);
  let fore = find(foreKeys);

  const pair = find(['lengths', 'length', 'pair', 'segmentLengths', 'boneLengths']);
  if (Array.isArray(pair)) {
    if (upper === undefined && Number.isFinite(pair[0])) upper = pair[0];
    if (fore === undefined && Number.isFinite(pair[1])) fore = pair[1];
  } else if (isObject(pair)) {
    if (upper === undefined) upper = pair.upper ?? pair.upperArm ?? pair[0] ?? pair.l1;
    if (fore === undefined) fore = pair.fore ?? pair.forearm ?? pair[1] ?? pair.l2;
  }
  const segments = find(['segments', 'bones']);
  if (Array.isArray(segments)) {
    const nums = segments.map(item => typeof item === 'number' ? item : (item?.length ?? item?.len));
    if (upper === undefined && Number.isFinite(nums[0])) upper = nums[0];
    if (fore === undefined && Number.isFinite(nums[1])) fore = nums[1];
  }

  // 没有显式长度时，先从配置级绑定/静止姿态的肩肘腕量出原长。
  if (upper === undefined || fore === undefined) {
    const bind = find(['joints', 'bind', 'rest', 'restPose', 'setup', 'reference']) ?? {};
    const s = asPoint(bind.shoulder) ?? asPoint(find(['shoulder']));
    const e = asPoint(bind.elbow) ?? asPoint(find(['elbow']));
    const w = asPoint(bind.wrist) ?? asPoint(find(['wrist']));
    if (upper === undefined && s && e) { const d = dist(s, e); if (d > 1e-6) upper = d; }
    if (fore === undefined && e && w) { const d = dist(e, w); if (d > 1e-6) fore = d; }
  }

  // 仍缺失时，从关键姿态里的肩/肘/腕点量出“原长”。
  if ((upper === undefined || fore === undefined) && Array.isArray(normalizedKeys)) {
    for (const row of normalizedKeys) {
      const shoulder = row.shoulder ?? asPoint({ x: row.x, y: row.y });
      if (upper === undefined && row.elbow && shoulder) {
        const d = dist(shoulder, row.elbow);
        if (d > 1e-6) upper = d;
      }
      if (fore === undefined && row.elbow && row.wrist) {
        const d = dist(row.elbow, row.wrist);
        if (d > 1e-6) fore = d;
      }
    }
  }

  // 与旧示意手臂 32px 的总长相衔接。
  if (upper === undefined || !Number.isFinite(upper)) upper = 16;
  if (fore === undefined || !Number.isFinite(fore)) fore = 16;
  upper = number(upper, 1e-6, 10000, '上臂长度');
  fore = number(fore, 1e-6, 10000, '前臂长度');
  return { upper, fore };
}

function readInterval(scopes, duration) {
  for (const scope of scopes) {
    const from = scope.from ?? scope.start ?? scope.begin ?? scope.in ?? scope.startTime;
    const to = scope.to ?? scope.end ?? scope.finish ?? scope.out ?? scope.endTime;
    if (Number.isFinite(from) && Number.isFinite(to) &&
        // 排除手臂配置对象自身误带 from/to 但并非时段的极端情况：
        from >= 0 && to > from) {
      const f = number(from, 0, duration - 1, '交接起点', true);
      const t = number(to, f + 1, duration, '交接终点', true);
      return { from: f, to: t };
    }
  }
  return null;
}

// normalizedKeys 是已经过 pose() 规范化的关键姿态（可能含关节点）。
export function normalizeArm(input, duration, normalizedKeys) {
  if (!hasArmDraft(input)) return null;
  const scopes = scopesOf(input);
  const find = makeFinder(scopes);

  let grip = find(['grip', 'gripId', 'gripName', 'namedGrip', 'wristGrip',
    'holdId', 'holdName', 'hold', 'gripPoint', 'wristName']);
  if (isObject(grip)) grip = grip.id ?? grip.name ?? grip.grip;
  if (grip === undefined || grip === null) {
    const grips = input.grips ?? find(['grips']);
    if (Array.isArray(grips) && grips.length) {
      const named = grips.find(g => isObject(g) && (g.wrist === true || g.joint === 'wrist')) ?? grips[0];
      grip = typeof named === 'string' ? named : (named?.id ?? named?.name);
    }
  }
  if (grip === undefined || grip === null || grip === '') grip = 'wrist';
  requireThat(typeof grip === 'string' && grip.trim().length >= 1 && grip.trim().length <= 40,
    '握点名称需要 1–40 位字符');
  grip = grip.trim();
  // 符合通用标识规则时走同一套 key 校验；否则保留可读名称。
  if (/^[a-zA-Z0-9][\w-]{0,31}$/.test(grip)) grip = key(grip, '握点标识');

  const { upper, fore } = readLengthPair(find, normalizedKeys);

  let sideValue = find(['bend', 'bendSide', 'bendDirection', 'side', 'elbowSide',
    'elbowDirection', 'curveSide', 'poleSide', 'handedness', 'sign', 'orientation']);
  // elbow 既可能是关节点，也可能直接写成侧向枚举/正负号；仅在是原始值时采用。
  const elbowSetting = find(['elbow']);
  if (sideValue === undefined && (typeof elbowSetting === 'string' || typeof elbowSetting === 'number'
    || typeof elbowSetting === 'boolean')) {
    sideValue = elbowSetting;
  }
  let { side, bend } = parseSide(sideValue);
  const pole = findPoint(scopes, ['pole', 'poleTarget', 'poleVector']);
  if (pole) bend = 'pole';

  let shoulderOffset = findPoint(scopes, ['shoulderOffset', 'shoulderShift', 'rootToShoulder']);
  if (!shoulderOffset) {
    const shoulder = find(['shoulder']);
    // 配置级 shoulder 点视为相对根的偏移；关键帧级 shoulder 才是世界轨迹。
    if (asPoint(shoulder)) shoulderOffset = asPoint(shoulder);
  }
  if (!shoulderOffset) {
    const sx = find(['shoulderX', 'sx', 'shoulderOffsetX']);
    const sy = find(['shoulderY', 'sy', 'shoulderOffsetY']);
    if (Number.isFinite(sx) && Number.isFinite(sy)) shoulderOffset = { x: sx, y: sy };
  }
  shoulderOffset = shoulderOffset ?? { x: 0, y: 0 };
  shoulderOffset = {
    x: number(shoulderOffset.x, -1000, 1000, '肩偏移 X'),
    y: number(shoulderOffset.y, -1000, 1000, '肩偏移 Y'),
  };

  let interval = readInterval(scopes, duration);
  let intervalBracket = null;
  if (!interval) {
    // 也接受 handoffs/handoffWindows 等复数列表；当前规则聚焦一条手臂的主交接段。
    const list = find(['handoffs', 'handoffWindows', 'handoverWindows', 'transfers', 'phases']);
    if (Array.isArray(list) && list.length && isObject(list[0])) {
      const first = list[0];
      const from = first.from ?? first.start ?? first.begin;
      const to = first.to ?? first.end ?? first.finish;
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
        interval = {
          from: number(from, 0, duration - 1, '交接起点', true),
          to: number(to, from + 1, duration, '交接终点', true),
        };
        intervalBracket = findPoint([first], BRACKET_KEYS.concat(['at', 'position', 'point']));
      }
    }
  }
  const bracket = resolveNamedBracket(input, scopes, find) ?? intervalBracket;
  if (interval) {
    requireThat(bracket, '交接时段需要标明托架的世界位置（bracket/rack/target 等 {x,y}）');
  }

  const id = find(['id', 'rigId', 'armId', 'name']);
  return {
    id: typeof id === 'string' && /^[a-zA-Z0-9][\w-]{0,31}$/.test(id) ? id : 'arm',
    grip,
    upper,
    fore,
    lengths: [upper, fore],
    side,
    bend,
    pole: pole ?? null,
    shoulderOffset,
    bracket: bracket ? { x: bracket.x, y: bracket.y } : null,
    handoff: interval,
  };
}

// 原稿手臂角度方向：与画布旧示意一致，angle=0 指向屏幕上方。
export function angleDirection(degrees) {
  const a = (Number.isFinite(degrees) ? degrees : 0) * Math.PI / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function samplePointTrack(keys, field, time) {
  const rows = keys.filter(k => isObject(k[field]));
  if (!rows.length) return null;
  if (rows.length === 1) return { ...rows[0][field] };
  let i = 1;
  while (i < rows.length - 1 && rows[i].time < time) i++;
  const before = rows[i - 1], after = rows[i];
  const span = after.time - before.time || 1;
  const t = Math.max(0, Math.min(1, (time - before.time) / span));
  return {
    x: lerp(before[field].x, after[field].x, t),
    y: lerp(before[field].y, after[field].y, t),
  };
}

export function sampleShoulder(config, keys, pose, time) {
  const worldTrack = Array.isArray(keys) ? samplePointTrack(keys, 'shoulder', time) : null;
  if (worldTrack) return worldTrack;
  const offsetTrack = Array.isArray(keys) ? samplePointTrack(keys, 'shoulderOffset', time) : null;
  if (offsetTrack) return { x: pose.x + offsetTrack.x, y: pose.y + offsetTrack.y };
  return { x: pose.x + config.shoulderOffset.x, y: pose.y + config.shoulderOffset.y };
}

function inHandoff(config, index, fps) {
  const h = config.handoff;
  if (!h) return false;
  const numerator = index * 1000;
  return h.from * fps <= numerator && numerator < h.to * fps;
}

// 两截定长 IK。返回肘点与可达性；d≈0 且两截等长时沿原稿上臂方向折回。
export function solveChain(shoulder, target, upper, fore, side, fallbackDirection) {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const d = Math.hypot(dx, dy);
  const maxReach = upper + fore;
  const minReach = Math.abs(upper - fore);
  const EPS = 1e-7;
  if (d > maxReach + EPS) {
    return { reachable: false, reason: 'too-far', d, elbow: null };
  }
  if (d < minReach - EPS) {
    return { reachable: false, reason: 'too-close', d, elbow: null };
  }
  if (d <= EPS) {
    if (minReach > EPS) return { reachable: false, reason: 'too-close', d, elbow: null };
    const dir = fallbackDirection && Math.hypot(fallbackDirection.x, fallbackDirection.y) > 1e-9
      ? fallbackDirection
      : { x: 1, y: 0 };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const elbow = {
      x: shoulder.x + upper * dir.x / len,
      y: shoulder.y + upper * dir.y / len,
    };
    return { reachable: true, degenerate: true, d, elbow };
  }
  // 余弦定理求肩到“肘在肩腕连线上投影点”的距离 a 与高度 h。
  const a = (upper * upper - fore * fore + d * d) / (2 * d);
  const h2 = Math.max(0, upper * upper - a * a);
  const h = Math.sqrt(h2);
  const ux = dx / d, uy = dy / d;
  // p = (-uy, ux)：肩→腕向右时 p 指向屏幕下方，故 side=+1 为连线下侧。
  const px = -uy, py = ux;
  const baseX = shoulder.x + a * ux;
  const baseY = shoulder.y + a * uy;
  const elbow = { x: baseX + side * h * px, y: baseY + side * h * py };
  return { reachable: true, degenerate: h <= EPS, d, elbow };
}

function interpolateField(keys, time, field) {
  let i = 1;
  while (i < keys.length - 1 && keys[i].time < time) i++;
  const before = keys[i - 1], after = keys[i];
  const t = Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time || 1)));
  return lerp(before[field] ?? 0, after[field] ?? 0, t);
}

// 计算未镜像（原稿/右向世界）空间中的一帧手臂。
export function evaluateArm(config, { pose, keys, time, index, fps }) {
  const shoulder = sampleShoulder(config, keys, pose, time);
  const active = inHandoff(config, index, fps);
  const fallback = angleDirection(pose.arm);

  if (active && config.bracket) {
    let side = config.side;
    if (config.pole) {
      // 极点世界位置在肩腕线的哪一侧，肘就折向哪一侧。
      const wx = config.bracket.x - shoulder.x, wy = config.bracket.y - shoulder.y;
      const px = config.pole.x - shoulder.x, py = config.pole.y - shoulder.y;
      const cross = wx * py - wy * px;
      if (Math.abs(cross) > 1e-9) side = cross > 0 ? 1 : -1;
    }
    const solved = solveChain(shoulder, config.bracket, config.upper, config.fore, side, fallback);
    if (!solved.reachable) {
      return {
        handoff: true, active: true, reachable: false, reason: solved.reason,
        shoulder, elbow: null, wrist: null, bracket: { ...config.bracket },
        distance: solved.d, gap: null, side,
      };
    }
    const elbow = solved.elbow;
    const wrist = { ...config.bracket };
    const gap = dist(wrist, config.bracket);
    return {
      handoff: true, active: true, reachable: true, degenerate: Boolean(solved.degenerate),
      shoulder, elbow, wrist, bracket: { ...config.bracket },
      distance: solved.d, gap, side,
      upperAngle: angleOf(shoulder, elbow), forearmAngle: angleOf(elbow, wrist),
    };
  }

  // 非交接帧：若原稿直接给了肘/腕关节轨迹，按时间插值播放原肩肘动作；
  // 否则按当帧原稿手臂角度作定长 FK（两截保持原长，可再给前臂角度/折角）。
  const authoredElbow = Array.isArray(keys) ? samplePointTrack(keys, 'elbow', time) : null;
  const authoredWrist = Array.isArray(keys) ? samplePointTrack(keys, 'wrist', time) : null;
  if (authoredElbow && authoredWrist) {
    return {
      handoff: false, active: false, reachable: true,
      shoulder, elbow: authoredElbow, wrist: authoredWrist,
      bracket: config.bracket ? { ...config.bracket } : null,
      distance: dist(shoulder, authoredWrist), gap: null, side: config.side,
      upperAngle: angleOf(shoulder, authoredElbow),
      forearmAngle: angleOf(authoredElbow, authoredWrist),
    };
  }
  const upperDeg = Number.isFinite(pose.arm) ? pose.arm : interpolateField(keys, time, 'arm');
  const upperDir = angleDirection(upperDeg);
  const elbow = { x: shoulder.x + config.upper * upperDir.x, y: shoulder.y + config.upper * upperDir.y };
  let foreDeg;
  if (keys && keys.some(k => Number.isFinite(k.forearm))) {
    foreDeg = interpolateField(keys, time, 'forearm');
  } else if (keys && keys.some(k => Number.isFinite(k.elbowBend))) {
    foreDeg = upperDeg + interpolateField(keys, time, 'elbowBend');
  } else {
    foreDeg = upperDeg;
  }
  const foreDir = angleDirection(foreDeg);
  const wrist = { x: elbow.x + config.fore * foreDir.x, y: elbow.y + config.fore * foreDir.y };
  return {
    handoff: false, active: false, reachable: true,
    shoulder, elbow, wrist, bracket: config.bracket ? { ...config.bracket } : null,
    distance: dist(shoulder, wrist), gap: null, side: config.side,
    upperAngle: upperDeg, forearmAngle: foreDeg,
  };
}

// 与 angleDirection 互逆：返回旧约定角度（0 指向上方）。
function angleOf(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const phi = Math.atan2(dy, dx);
  return phi * 180 / Math.PI + 90;
}

export function mirrorPoint(point) {
  return { x: -point.x, y: point.y };
}

export function orientArm(frame, facing) {
  if (facing !== 'left') return frame;
  return {
    ...frame,
    shoulder: mirrorPoint(frame.shoulder),
    elbow: frame.elbow ? mirrorPoint(frame.elbow) : null,
    wrist: frame.wrist ? mirrorPoint(frame.wrist) : null,
    bracket: frame.bracket ? mirrorPoint(frame.bracket) : null,
  };
}

function clean(point) {
  return { x: point.x, y: point.y };
}

// 生成挂到采样帧上的全部具名坐标与别名结构。
export function armFrameFields(config, arm) {
  const shoulder = clean(arm.shoulder);
  const elbow = arm.elbow ? clean(arm.elbow) : null;
  const wrist = arm.wrist ? clean(arm.wrist) : null;
  const bracket = arm.bracket ? clean(arm.bracket) : null;
  const gripPoint = wrist ? { id: config.grip, name: config.grip, kind: 'grip', x: wrist.x, y: wrist.y } : null;
  const joints = { shoulder, elbow, wrist };
  const namedArray = [
    { id: 'shoulder', name: 'shoulder', kind: 'joint', ...shoulder },
    ...(elbow ? [{ id: 'elbow', name: 'elbow', kind: 'joint', ...elbow }] : []),
    ...(wrist ? [{ id: 'wrist', name: 'wrist', kind: 'joint', ...wrist }] : []),
    ...(gripPoint ? [gripPoint] : []),
  ];
  const byName = {};
  for (const point of namedArray) byName[point.id] = { x: point.x, y: point.y, id: point.id, name: point.name };
  if (gripPoint) {
    byName.grip = byName[config.grip];
    byName.hand = byName[config.grip];
    byName.hold = byName[config.grip];
  }
  const handoffInfo = config.handoff ? {
    active: arm.active,
    from: config.handoff.from,
    to: config.handoff.to,
    reachable: arm.reachable,
    distance: arm.distance,
    gap: arm.gap,
    bracket,
  } : null;
  const block = {
    id: config.id,
    grip: gripPoint,
    gripId: config.grip,
    gripName: config.grip,
    gripPoint,
    joints,
    jointList: [shoulder, elbow, wrist].filter(Boolean),
    jointArray: [shoulder, elbow, wrist].filter(Boolean),
    chainPoints: [shoulder, elbow, wrist].filter(Boolean),
    shoulder, elbow, wrist,
    points: namedArray,
    lengths: [config.upper, config.fore],
    upper: config.upper,
    fore: config.fore,
    bend: config.bend,
    side: config.side,
    handoff: arm.active,
    handoffWindow: config.handoff,
    holding: Boolean(arm.active && arm.reachable),
    reachable: arm.reachable,
    degenerate: Boolean(arm.degenerate),
    bracket,
    target: bracket,
    rack: bracket,
    holster: bracket,
    socket: bracket,
    distance: arm.distance,
    gap: arm.gap,
    upperAngle: arm.upperAngle,
    forearmAngle: arm.forearmAngle,
    forearmRotation: elbow && wrist ? Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x) : null,
    forearmRotationDeg: elbow && wrist ? Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x) * 180 / Math.PI : null,
  };
  return {
    arm: block,
    arm2d: block,
    rig: block,
    limb: block,
    limbs: [block],
    arms: [block],
    chain: block,
    skeleton: block,
    ik: block,
    joints,
    jointList: block.jointList,
    jointArray: block.jointArray,
    shoulder,
    elbow,
    wrist,
    grip: gripPoint,
    hand: gripPoint,
    hold: gripPoint,
    gripId: config.grip,
    grips: gripPoint ? [gripPoint] : [],
    gripList: gripPoint ? [gripPoint] : [],
    allGrips: gripPoint ? [gripPoint] : [],
    gripPoints: byName,
    gripsByName: byName,
    gripMap: byName,
    gripsById: byName,
    namedGrips: byName,
    named: byName,
    coordinates: byName,
    worldPoints: byName,
    pointsByName: byName,
    namedPointsById: byName,
    points: namedArray,
    namedPoints: namedArray,
    markers: namedArray,
    anchors: namedArray,
    locators: namedArray,
    holding: Boolean(arm.active && arm.reachable),
    gripping: Boolean(arm.active && arm.reachable),
    locked: Boolean(arm.active && arm.reachable),
    bracket,
    rack: bracket,
    holster: bracket,
    socket: bracket,
    target: bracket,
    handoff: handoffInfo,
  };
}

export function armSheetDescriptor(config, facing) {
  const bracket = config.bracket
    ? (facing === 'left' ? mirrorPoint(config.bracket) : { ...config.bracket })
    : null;
  const descriptor = {
    id: config.id,
    grip: config.grip,
    grips: [config.grip],
    upper: config.upper,
    fore: config.fore,
    lengths: [config.upper, config.fore],
    bend: config.bend,
    side: config.side,
    shoulderOffset: { ...config.shoulderOffset },
    bracket,
    handoff: config.handoff ? { ...config.handoff } : null,
  };
  return descriptor;
}

// 供画布/检查面板使用的四角几何也放在这里，保证下载与画面一致。
export function rotatedCorners(rect, pivot, axisX, axisY) {
  const locals = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
  return locals.map(([lx, ly]) => ({
    x: pivot.x + lx * axisX.x + ly * axisY.x,
    y: pivot.y + lx * axisX.y + ly * axisY.y,
  }));
}

export function aabbOf(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
