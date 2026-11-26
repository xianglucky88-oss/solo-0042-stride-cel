import { choice, key, list, number, object, requireThat, unique } from '../server/input.mjs';

function pose(row, duration) {
  object(row, '姿态');
  return {
    time: number(row.time, 0, duration, '姿态时间', true),
    x: number(row.x, -1000, 1000, '根 X'),
    y: number(row.y, -1000, 1000, '根 Y'),
    arm: number(row.arm, -180, 180, '手臂角度'),
  };
}

export function normalize(input) {
  object(input, '动画');
  const duration = number(input.duration, 100, 8000, '时长 ms', true);
  const keys = list(input.keys, 2, 48, '关键姿态').map(row => pose(row, duration)).sort((a,b) => a.time-b.time);
  requireThat(keys[0].time === 0 && keys.at(-1).time === duration, '须提供起点和结束关键姿态');
  requireThat(keys.every((row,i) => !i || row.time > keys[i-1].time), '关键姿态时间不得重复');
  const windows = unique(list(input.windows, 0, 24, '作用区').map(row => {
    object(row, '作用区');
    const from = number(row.from, 0, duration-1, '作用区起点', true);
    return { id: key(row.id), from, to: number(row.to, from+1, duration, '作用区结束', true),
      x: number(row.x,-240,240,'区域 X'), y: number(row.y,-240,240,'区域 Y'),
      w: number(row.w,1,240,'区域宽度'), h: number(row.h,1,240,'区域高度') };
  }), '作用区');
  const holds = input.holds === undefined ? undefined : list(input.holds, 0, 12, '停顿').map(row => {
    object(row, '停顿');
    return { at: number(row.at, 0, duration-1, '停顿刻度', true),
      duration: number(row.duration, 1, 2000, '停顿时长', true) };
  }).sort((a,b) => a.at-b.at);
  if (holds) requireThat(holds.every((row,i) => !i || row.at > holds[i-1].at), '停顿刻度不得重复');
  const held = (holds ?? []).reduce((sum, hold) => sum + hold.duration, 0);
  const events = unique(list(input.events, 0, 48, '事件').map(row => {
    object(row, '事件');
    const clock = row.clock === undefined ? undefined : choice(row.clock, ['action','game'], '事件时钟');
    const time = clock === 'game'
      ? number(row.time, 0, duration+held-1, '事件时刻', true)
      : number(row.time, 0, duration-1, '事件刻度', true);
    return { id: key(row.id), time, kind: choice(row.kind,['step','impact','effect'],'事件类型'), ...(clock ? { clock } : {}) };
  }), '事件').sort((a,b) => a.time-b.time || a.id.localeCompare(b.id));
  requireThat(typeof input.loop === 'boolean', 'loop 必须是布尔值');
  return { id:key(input.id), duration, fps:number(input.fps,6,60,'帧率',true), facing:choice(input.facing,['left','right'],'朝向'), loop:input.loop, keys, windows, ...(holds ? { holds } : {}), events };
}
