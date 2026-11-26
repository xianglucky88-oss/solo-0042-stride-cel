import { el } from './dom.mjs';

export function timeline(stage,sheet,handlers={}) {
  const {onFrame=()=>{},onSelection=()=>{},onPlay=()=>{}}=handlers;
  const bar=el('div',undefined,'transport'), play=el('button','▶'), slider=el('input'), counter=el('span',undefined,'mono');
  play.setAttribute('aria-label','播放');play.title='播放或暂停';
  slider.type='range';slider.min=0;slider.max=sheet.frames.length-1;slider.value=0;slider.setAttribute('aria-label','当前帧');
  const strip=el('div',undefined,'frame-strip');
  strip.setAttribute('aria-label','圈定连续帧并查看作用区');
  strip.tabIndex=0;
  const tiles=sheet.frames.map(frame=>{
    const tile=el('span'); tile.dataset.index=String(frame.index);
    tile.dataset.kind=frame.events.length?'event':frame.boxes.length?'active':'idle';
    tile.title=`帧 ${frame.index+1} · ${frame.time.toFixed(3)} ms · ${frame.events.map(e=>e.id).join('、')||(frame.boxes.length?'作用区开启':'无事件')}`;
    return tile;
  });
  strip.append(...tiles);bar.append(play,slider,counter);stage.append(strip,bar);
  let index=0,timer,playing=false,pointer=null,anchor=0,selection={start:0,end:0};
  function paint(){
    tiles.forEach((tile,at)=>{
      if(at>=selection.start&&at<=selection.end) tile.dataset.selected='true';
      else tile.removeAttribute('data-selected');
    });
    const {start,end}=selection;
    strip.setAttribute('aria-valuetext',`第 ${start+1} 至 ${end+1} 帧`);
  }
  function seek(next){
    tiles[index]?.removeAttribute('data-current');
    index=Math.min(Math.max(next,0),sheet.frames.length-1);
    tiles[index].dataset.current='true';slider.value=index;
    counter.textContent=`${index+1} / ${sheet.frames.length}`;onFrame(index);
  }
  function choose(next){
    selection={start:Math.min(anchor,next),end:Math.max(anchor,next)};
    paint();onSelection({...selection});
  }
  function pause(){
    if(!playing) return;
    clearInterval(timer);timer=undefined;playing=false;
    play.textContent='▶';play.setAttribute('aria-label','播放');onPlay(false);
  }
  function stop(){pause();}
  play.onclick=()=>{
    if(playing) return pause();
    if(index===sheet.frames.length-1) seek(0);
    playing=true;play.textContent='Ⅱ';play.setAttribute('aria-label','暂停');onPlay(true);
    timer=setInterval(()=>{
      if(index+1<sheet.frames.length) seek(index+1);
      else if(sheet.loop) seek(0);
      else pause();
    },1000/sheet.fps);
  };
  slider.oninput=()=>seek(Number(slider.value));
  function tileAt(event){
    return document.elementFromPoint(event.clientX,event.clientY)
      ?.closest?.('span[data-index]') ?? null;
  }
  strip.addEventListener('pointerdown',event=>{
    const tile=event.target.closest('span[data-index]'); if(!tile) return;
    pause();
    const at=Number(tile.dataset.index);
    const inside=at>=selection.start&&at<=selection.end;
    anchor=event.shiftKey?selection.start:at;
    pointer={id:event.pointerId,start:at,last:at,moved:false,inside:inside&&!event.shiftKey};
    strip.setPointerCapture?.(event.pointerId);
    if(!pointer.inside) choose(at);
    seek(at);
  });
  strip.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId) return;
    const tile=tileAt(event);
    if(!tile) return;
    const at=Number(tile.dataset.index);
    // Tiny jitter within the starting tile must not collapse an existing circle.
    if(at===pointer.start&&!pointer.moved) return;
    if(at!==pointer.start) { pointer.moved=true; pointer.inside=false; }
    if(at!==pointer.last) { pointer.last=at; choose(at); }
  });
  function release(event){
    if(!pointer||pointer.id!==event.pointerId) return;
    try { strip.releasePointerCapture?.(event.pointerId); } catch {}
    const {moved,start,inside}=pointer; pointer=null;
    // A plain click inside the circle just moves the playhead; it must not
    // collapse the circled span, which is what the drag will be scoped to.
    if(!moved) {
      if(inside) { paint(); return; }
      anchor=start;choose(start);
    }
  }
  strip.addEventListener('pointerup',release);
  strip.addEventListener('pointercancel',release);
  seek(Math.floor(sheet.frames.length*.35));
  anchor=index;selection={start:index,end:index};paint();
  return {
    stop,
    pause,
    seek,
    index:()=>index,
    playing:()=>playing,
    selection:()=>({...selection}),
    select(start,end=start){
      anchor=start;selection={start:Math.min(start,end),end:Math.max(start,end)};paint();
      onSelection({...selection});
      if(index<selection.start||index>selection.end) seek(selection.start);
    },
  };
}
