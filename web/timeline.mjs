import { el } from './dom.mjs';
import { audition } from './audition.mjs';

export function timeline(stage,sheet,update) {
  const bar=el('div',undefined,'transport'), play=el('button','▶'), hear=el('button','🔊'), slider=el('input'), counter=el('span',undefined,'mono');
  play.setAttribute('aria-label','播放');play.title='播放或暂停';
  hear.setAttribute('aria-label','试听');hear.title='从当前帧起有声试听一遍';
  slider.type='range';slider.min=0;slider.max=sheet.frames.length-1;slider.value=0;slider.setAttribute('aria-label','当前帧');
  const strip=el('div',undefined,'frame-strip');strip.setAttribute('aria-label','作用区与事件帧');
  const tiles=sheet.frames.map(frame=>{
    const box=el('span'); box.dataset.kind=frame.events.some(evt=>evt.sound)?'sound':frame.events.length?'event':frame.boxes.length?'active':'idle';
    box.title=`帧 ${frame.index} · ${frame.events.map(e=>e.id).join('、') || (frame.boxes.length?'作用区开启':'无事件')}`;
    return box;
  });
  strip.append(...tiles);bar.append(play,hear,slider,counter);stage.append(strip,bar);
  let index=0,timer,stopHearing;
  function seek(next){
    tiles[index]?.removeAttribute('data-current');
    index=next;tiles[index].dataset.current='true';slider.value=index;
    counter.textContent=`${index+1} / ${sheet.frames.length}`;update(index);
  }
  function stop(){clearInterval(timer);timer=undefined;play.textContent='▶';play.setAttribute('aria-label','播放');}
  function hearing(active){
    hear.textContent=active?'■':'🔊';
    hear.setAttribute('aria-label',active?'停止试听':'试听');
    hear.classList.toggle('hearing',active);
  }
  function silence(){ stopHearing?.(); stopHearing=undefined; hearing(false); }
  slider.oninput=()=>{ silence(); seek(Number(slider.value)); };
  hear.onclick=()=>{
    if(stopHearing) return silence();
    stop();
    try {
      stopHearing=audition(sheet,index,{tick:seek,end:()=>{ stopHearing=undefined; hearing(false); }});
      hearing(true);
    } catch { stopHearing=undefined; hearing(false); }
  };
  play.onclick=()=>{
    silence();
    if(timer) return stop();
    if(index===sheet.frames.length-1) seek(0);
    play.textContent='Ⅱ';play.setAttribute('aria-label','暂停');
    timer=setInterval(()=>{
      if(index+1<sheet.frames.length) seek(index+1);
      else if(sheet.loop) seek(0);
      else stop();
    },1000/sheet.fps);
  };
  seek(Math.floor(sheet.frames.length*.35));
  return ()=>{ silence(); stop(); };
}
