import { checklist, el, metrics } from './dom.mjs';
import { draw, fit, unproject } from './draw-pose.mjs';
import { timeline } from './timeline.mjs';

export const mountImport=null;
export const fields=[['采样帧率','fps','number',[6,60,1]],['朝向','facing','select',[['right','向右'],['left','向左']]],['循环','loop','checkbox']];

// Map a pointer's client position onto the canvas' internal pixel grid so a
// drag stays glued to the cursor at any CSS size, browser zoom or device
// pixel ratio instead of trusting raw client coordinates.
export function canvasPoint(canvas,event) {
  const rect=canvas.getBoundingClientRect();
  // Guard a zero-sized canvas (hidden tab) against division by zero.
  const sx=rect.width?canvas.width/rect.width:1, sy=rect.height?canvas.height/rect.height:1;
  return {x:(event.clientX-rect.left)*sx,y:(event.clientY-rect.top)*sy};
}

function scenePoint(view,canvas,event) {
  const point=canvasPoint(canvas,event);
  return unproject(view,point.x,point.y);
}

// The half-open span covers the selected frames' action time: the first
// selected sample up to (but not including) the next sample after the last
// selection, or the real end of the action when the final frame is selected.
export function spanFor(sheet,selection) {
  const from=sheet.frames[selection.start].time;
  const next=sheet.frames[selection.end+1];
  return {from,to:next?next.time:sheet.duration};
}

// A pointer nudge is measured in scene pixels, then stored relative to the
// character root: under left facing the local X axis runs opposite to the
// world axis, so a rightward world drag becomes a negative local delta.
export function localDelta(sheet,worldDx,worldDy) {
  return {dx:sheet.facing==='left'?-worldDx:worldDx,dy:worldDy};
}

export function hitBox(sheet,index,point,boxes=sheet.frames[index]?.boxes??[]) {
  for(let i=boxes.length-1;i>=0;i--) {
    const box=boxes[i];
    if(point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h) return box;
  }
  return null;
}

// Camera bounds from the document's own window definitions, ignoring any
// span-scoped nudges. Dragging a box therefore never changes the framing, and
// committing the drag cannot re-frame the freshly recompiled sheet either.
function baseExtent(sheet, windows, facing) {
  const defs=new Map(windows.map(window=>[window.id,window]));
  const extent={left:Infinity,right:-Infinity,top:-100,bottom:0};
  const see=(left,top,w,h)=>{
    extent.left=Math.min(extent.left,left);extent.right=Math.max(extent.right,left+w);
    extent.top=Math.min(extent.top,top);extent.bottom=Math.max(extent.bottom,top+h);
  };
  for(const frame of sheet.frames) {
    for(const box of frame.boxes) {
      const window=defs.get(box.id);
      // Without the definition (older caller) fall back to the drawn box, which
      // is at least stable for this sheet.
      if(!window) { see(box.x,box.y,box.w,box.h); continue; }
      const x=facing==='left'?frame.pose.x-window.x-window.w:frame.pose.x+window.x;
      see(x,frame.pose.y+window.y,window.w,window.h);
    }
    see(frame.pose.x-72,frame.pose.y-100,144,110);
  }
  return extent;
}

export async function present({stage,inspect,summary,blob,document,state,onState,onAdjust}) {
  const sheet=JSON.parse(await blob.text()), canvas=el('canvas',undefined,'animation');
  canvas.width=860;canvas.height=370;canvas.setAttribute('aria-label','角色姿态、根轨迹与作用区');
  canvas.tabIndex=0;
  stage.append(canvas);
  // Fitted once per sheet from the document's window definitions (not from the
  // current, possibly nudged boxes): the framing never follows a box, so
  // dragging one toward an edge cannot re-frame the view, before or after commit.
  const view=fit(baseExtent(sheet,Array.isArray(document?.windows)?document.windows:[],sheet.facing),
    canvas.width,canvas.height);
  let selection={start:state?.selection?.start??0,end:state?.selection?.end??0};
  let selected=state?.window??null;
  let drag=null,committed=null,pending=false,index=0,stripApi=null;

  const selectionLabel=()=>{
    const {from,to}=spanFor(sheet,selection);
    return `${selection.start+1}–${selection.end+1} 帧 · ${from.toFixed(3)}–${to.toFixed(3)} ms（含起点，不含终点）`;
  };
  function publish(){ onState?.({index,selection:{...selection},window:selected}); }
  function render(){
    const frame=sheet.frames[index];
    // Live drag wins; a just-committed nudge stays visible while the refreshed
    // sheet is still in flight, so the box does not flicker back to its origin.
    const move=id=>drag&&drag.id===id?drag:committed&&committed.id===id?committed:null;
    const boxes=frame.boxes.map(box=>{
      const shift=move(box.id);
      return shift?{...box,x:box.x+shift.worldDx,y:box.y+shift.worldDy}:box;
    });
    draw(canvas,sheet,index,view,{boxes,selected,ghost:drag?.base});
  }
  function inspectFrame(){
    const frame=sheet.frames[index], {continuity,unsampled}=summary;
    const seam=continuity.loopClean===null?'单次播放':continuity.loopClean?'通过':'首尾有跳变';
    const rows=[`作用区：${frame.boxes.map(box=>box.id).join('、')||'无'}`,
      `事件：${frame.events.map(evt=>`${evt.id} +${evt.offset.toFixed(1)} ms`).join('、')||'无'}`,
      `循环接缝：${seam} · ${continuity.angularJump.toFixed(1)}°`,
      `周期位移：${continuity.cycleTravel.x.toFixed(1)}, ${continuity.cycleTravel.y.toFixed(1)} px`,
      `所选时段：${selectionLabel()}`];
    if(selected) rows.push(`已选作用区：${selected}${frame.boxes.some(box=>box.id===selected)?'':'（当前帧未显示）'}`);
    if(unsampled.length) rows.push(`未采样作用区：${unsampled.join('、')}`);
    if(drag) rows.push(`拖动中：${drag.worldDx.toFixed(3)}, ${drag.worldDy.toFixed(3)} px`);
    rows.push(stripApi?.playing()?'播放中 · 暂停后可拖动作用区':'在帧条上圈定连续帧，再在亮着的区域上按下并拖动');
    inspect.replaceChildren(el('h4',`帧 ${index+1} · ${frame.time.toFixed(3)} ms`,'mono'),checklist(rows));
  }
  function refresh(){render();inspectFrame();}
  function finishDrag(event){
    if(!drag) return;
    if(event) { try { canvas.releasePointerCapture(event.pointerId); } catch {} }
    const finished=drag; drag=null;
    canvas.classList.remove('dragging');
    // A plain click selects the box without emitting a zero-length adjustment.
    if(Math.abs(finished.worldDx)<1e-6&&Math.abs(finished.worldDy)<1e-6) { refresh();publish(); return; }
    const {from,to}=spanFor(sheet,selection);
    const {dx,dy}=localDelta(sheet,finished.worldDx,finished.worldDy);
    selected=finished.id;
    committed={id:finished.id,worldDx:finished.worldDx,worldDy:finished.worldDy};
    refresh();publish();
    pending=true;
    Promise.resolve(onAdjust?.({window:finished.id,from,to,dx,dy}))
      // On success a refreshed sheet replaces this view; on failure repaint the
      // committed sheet so the box visibly returns to its real position.
      .finally(()=>{pending=false;committed=null;refresh();});
  }

  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||drag||pending) return;
    stripApi?.pause();
    if(index<selection.start||index>selection.end) return;
    const point=scenePoint(view,canvas,event);
    const box=hitBox(sheet,index,point);
    if(!box) return;
    selected=box.id;
    drag={id:box.id,origin:point,base:{x:box.x,y:box.y,w:box.w,h:box.h},worldDx:0,worldDy:0};
    canvas.classList.add('dragging');
    canvas.setPointerCapture?.(event.pointerId);
    refresh();publish();
    event.preventDefault();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag) return;
    const point=scenePoint(view,canvas,event);
    // Quantise to a thousandth of a scene pixel: removes float dust without
    // collapsing the exact whole-pixel drag the user performed.
    drag.worldDx=Math.round((point.x-drag.origin.x)*1000)/1000;
    drag.worldDy=Math.round((point.y-drag.origin.y)*1000)/1000;
    refresh();
  });
  canvas.addEventListener('pointerup',finishDrag);
  canvas.addEventListener('pointercancel',finishDrag);
  canvas.addEventListener('lostpointercapture',event=>{ if(drag) finishDrag(event); });

  stripApi=timeline(stage,sheet,{
    onFrame:next=>{index=next;refresh();publish();},
    onSelection:next=>{selection={...next};refresh();publish();},
    onPlay:playing=>{ if(playing) { drag=null; canvas.classList.remove('dragging'); } refresh(); },
  });

  if(state?.selection) stripApi.select(state.selection.start,state.selection.end);
  else selection=stripApi.selection();
  if(Number.isInteger(state?.index)) stripApi.seek(Math.min(Math.max(state.index,0),sheet.frames.length-1));
  refresh();publish();

  stage.append(metrics([['采样帧',summary.frames],['生效帧',summary.active],['事件',summary.events]]));
  return ()=>{stripApi?.stop();};
}
