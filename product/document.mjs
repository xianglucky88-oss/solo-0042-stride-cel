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
  const events = unique(list(input.events, 0, 48, '事件').map(row => {
    object(row, '事件');
    return { id: key(row.id), time: number(row.time,0,duration-1,'事件刻度',true), kind: choice(row.kind,['step','impact','effect'],'事件类型') };
  }), '事件').sort((a,b) => a.time-b.time || a.id.localeCompare(b.id));
  // Span-scoped drags: a root-relative nudge of one existing window over the
  // action-time span that was selected in the proof. Span ends stay exact
  // (e.g. 1000/30) and are never rounded to whole milliseconds. The key is
  // omitted entirely when absent so an existing document keeps its freeze digest.
  const adjustments = list(input.adjustments ?? [], 0, 48, '作用区位移').map(row => {
    object(row, '作用区位移');
    const window = key(row.window, '位移作用区');
    requireThat(windows.some(item => item.id === window), '作用区位移必须指向已有的作用区');
    const from = number(row.from, 0, duration, '位移起点');
    const to = number(row.to, 0, duration, '位移终点');
    requireThat(to > from, '位移时段长度必须为正');
    return { window, from, to, dx:number(row.dx,-2000,2000,'水平位移'), dy:number(row.dy,-2000,2000,'垂直位移') };
  });
  requireThat(typeof input.loop === 'boolean', 'loop 必须是布尔值');
  const document = { id:key(input.id), duration, fps:number(input.fps,6,60,'帧率',true),
    facing:choice(input.facing,['left','right'],'朝向'), loop:input.loop, keys, windows, events };
  if (adjustments.length) document.adjustments = adjustments;
  return document;
}
