import { el } from './dom.mjs';
import { get } from './api.mjs';
import { figure } from './draw-pose.mjs';

// 冻结包帧复查：凭冻结链接与帧号直接读取单帧（帧号从 0 起）。
// 每次跳帧只请求该帧数据；迟到的旧响应一律丢弃，不得覆盖最后选中的帧。
export function mountPackReview(container) {
  let version=null, ticket=0;
  const input=el('input'); input.type='number'; input.min=0; input.step=1; input.setAttribute('aria-label','帧号');
  const show=el('button','查看帧'); show.type='button'; show.title='读取并绘制指定帧';
  const prev=el('button','‹'); prev.type='button'; prev.title='上一帧'; prev.setAttribute('aria-label','上一帧');
  const next=el('button','›'); next.type='button'; next.title='下一帧'; next.setAttribute('aria-label','下一帧');
  const link=el('a','下载冻结包');
  const canvas=el('canvas',undefined,'pack-canvas'); canvas.width=275; canvas.height=220;
  canvas.setAttribute('aria-label','冻结包单帧姿态与作用区');
  const readout=el('div');
  const note=el('p','打开冻结版本后可按帧复查。','note');
  const fmt=value=>Number(value).toFixed(1);

  function draw(frame) {
    const ctx=canvas.getContext('2d'),{width:w,height:h}=canvas;
    const xs=[frame.pose.x-72,frame.pose.x+72,...frame.boxes.flatMap(box=>[box.x,box.x+box.w])];
    const ys=[frame.pose.y-100,frame.pose.y+10,...frame.boxes.flatMap(box=>[box.y,box.y+box.h])];
    const lo=Math.min(...xs),hi=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const scale=Math.min(2.2,(w-30)/(hi-lo),(h-30)/(bottom-top));
    const xx=n=>w/2+(n-(lo+hi)/2)*scale, yy=n=>h/2+(n-(top+bottom)/2)*scale;
    ctx.fillStyle='#161b1e';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#748489';ctx.beginPath();ctx.moveTo(0,yy(0));ctx.lineTo(w,yy(0));ctx.stroke();
    for(const box of frame.boxes){
      ctx.fillStyle='#f1a25440';ctx.strokeStyle='#ffb969';
      ctx.fillRect(xx(box.x),yy(box.y),box.w*scale,box.h*scale);
      ctx.strokeRect(xx(box.x),yy(box.y),box.w*scale,box.h*scale);
    }
    ctx.save();ctx.translate(xx(frame.pose.x),yy(frame.pose.y));ctx.scale(scale,scale);
    figure(ctx,frame.pose.arm,version.facing);
    ctx.restore();
  }

  async function jump(frame) {
    if(!version) return;
    const index=Math.max(0,Math.min(version.frames-1,Math.trunc(frame)||0));
    input.value=index;
    const current=++ticket;
    note.textContent=`正在读取第 ${index} 帧…`;
    let frame1;
    try { frame1=await get(`/api/library/${version.id}/pack/${index}`); }
    catch(error) { if(current===ticket) note.textContent=error.message; return; }
    if(current!==ticket) return; // 更晚的跳帧已经发出，丢弃迟到的旧画面
    draw(frame1);
    readout.replaceChildren(
      el('h4',`帧 ${frame1.index} · ${fmt(frame1.time)} ms`,'mono'),
      el('p',`根 ${fmt(frame1.pose.x)}, ${fmt(frame1.pose.y)} · 手臂 ${fmt(frame1.pose.arm)}°`,'pack-line'),
      el('p',`作用区：${frame1.boxes.map(box=>box.id).join('、')||'无'}`,'pack-line'),
      el('p',`事件：${frame1.events.map(evt=>`${evt.id} +${fmt(evt.offset)} ms`).join('、')||'无'}`,'pack-line'),
    );
    note.textContent=`冻结包 ${version.id.slice(0,12)} · 共 ${version.frames} 帧`;
    history.replaceState(null,'',`?pack=${version.id}&frame=${index}`);
  }

  show.onclick=()=>jump(input.valueAsNumber);
  prev.onclick=()=>jump(Number(input.value||0)-1);
  next.onclick=()=>jump(Number(input.value||0)+1);
  input.onchange=()=>jump(input.valueAsNumber);

  function idle(message) {
    version=null; ticket++;
    container.replaceChildren(el('p',message,'note'));
  }

  return {
    open(id,record,frame) {
      ticket++;
      if(!record.pack) return idle('该版本没有冻结包。');
      version={id,frames:record.summary.frames,facing:record.document.facing};
      input.max=version.frames-1; input.value=0;
      link.href=`/api/library/${id}/pack`;
      const bar=el('div',undefined,'pack-bar'); bar.append(input,prev,next,show);
      const meta=el('p',undefined,'note'); meta.append(link,document.createTextNode(` · ${record.pack.bytes} 字节`));
      container.replaceChildren(bar,canvas,readout,meta,note);
      readout.replaceChildren(); note.textContent=`输入 0–${version.frames-1} 的帧号查看单帧。`;
      if(frame!=null) jump(frame);
    },
    close() {
      idle('打开冻结版本后可按帧复查。');
      history.replaceState(null,'',location.pathname);
    },
  };
}
