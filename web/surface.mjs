import { checklist, el, metrics } from './dom.mjs';
import { draw } from './draw-pose.mjs';
import { timeline } from './timeline.mjs';

export const mountImport=null;
export const fields=[['采样帧率','fps','number',[6,60,1]],['朝向','facing','select',[['right','向右'],['left','向左']]],['循环','loop','checkbox']];

export async function present({stage,inspect,summary,blob}) {
  const sheet=JSON.parse(await blob.text()), canvas=el('canvas',undefined,'animation');
  canvas.width=860;canvas.height=370;canvas.setAttribute('aria-label','角色姿态、根轨迹与作用区');
  stage.append(canvas);
  const stop=timeline(stage,sheet,index=>{
    draw(canvas,sheet,index);
    const frame=sheet.frames[index], {continuity,unsampled}=summary;
    const seam=continuity.loopClean===null?'单次播放':continuity.loopClean?'通过':'首尾有跳变';
    const rows=[`作用区：${frame.boxes.map(box=>box.id).join('、')||'无'}`,
      `事件：${frame.events.map(evt=>`${evt.id} +${evt.offset.toFixed(1)} ms`).join('、')||'无'}`,
      `循环接缝：${seam} · ${continuity.angularJump.toFixed(1)}°`,
      `周期位移：${continuity.cycleTravel.x.toFixed(1)}, ${continuity.cycleTravel.y.toFixed(1)} px`];
    if(unsampled.length) rows.push(`未采样作用区：${unsampled.join('、')}`);
    inspect.replaceChildren(el('h4',`帧 ${index} · ${frame.time.toFixed(1)} ms`,'mono'),checklist(rows));
  });
  stage.append(metrics([['采样帧',summary.frames],['生效帧',summary.active],['事件',summary.events]]));
  return stop;
}
