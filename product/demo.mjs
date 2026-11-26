export function demo() {
  return { id:'forge-sweep', duration:850, fps:24, facing:'right', loop:true,
    keys:[{time:0,x:0,y:0,arm:-18},{time:170,x:12,y:-12,arm:-100},{time:330,x:56,y:-25,arm:60},
      {time:515,x:88,y:-7,arm:100},{time:690,x:98,y:0,arm:26},{time:850,x:105,y:0,arm:-18}],
    windows:[{id:'sweep',from:270,to:460,x:18,y:-52,w:66,h:34},{id:'heel',from:510,to:650,x:-15,y:-15,w:45,h:15}],
    events:[{id:'windup',time:130,kind:'effect'},{id:'contact',time:310,kind:'impact'},{id:'land',time:525,kind:'step'}],
  };
}

// 手臂交接样例：两截各 5px，肩 (10,20)→(16,20)，握点锁在托架 (16,20)，
// 首帧肘为 (13,24)（肩腕连线的下侧）；第 5 个采样帧肩腕重合，沿 arm=90°
// 的原稿上臂方向把肘放在 (21,20)。
export function demoArm() {
  return {
    id: 'bracket-handoff', duration: 1000, fps: 10, facing: 'right', loop: false,
    keys: [
      { time: 0, x: 10, y: 20, arm: 90 },
      { time: 500, x: 16, y: 20, arm: 90 },
      { time: 1000, x: 16, y: 20, arm: 90 },
    ],
    arm: {
      grip: 'prop',
      lengths: [5, 5],
      bend: 'below',
      bracket: { x: 16, y: 20 },
      handoff: { from: 0, to: 1000 },
    },
    windows: [
      { id: 'bracer', from: 0, to: 1000, x: 0, y: -2, w: 5, h: 4, attach: 'forearm', pivot: 'elbow' },
    ],
    events: [{ id: 'set', time: 0, kind: 'effect' }],
  };
}
