export function draw(canvas,sheet,index) {
  const ctx=canvas.getContext('2d'),{width:w,height:h}=canvas;
  const current=sheet.frames[index];
  const rigMode=Boolean(sheet.arm || current.arm);

  const bounds=rigMode ? rigBounds(sheet) : legacyBounds(sheet);
  const padX=rigMode?96:86, padTop=rigMode?70:75, padBottom=rigMode?56:75;
  let lo=bounds.lo,hi=bounds.hi,top=bounds.top,bottom=bounds.bottom;
  if(rigMode){
    // 给名称标签与托架标记留出世界空间余量。
    const dx=Math.max(hi-lo,1e-6),dy=Math.max(bottom-top,1e-6);
    lo-=dx*0.14+1;hi+=dx*0.14+1;top-=dy*0.16+1;bottom+=dy*0.16+1;
  }
  const spanX=Math.max(hi-lo,1e-6),spanY=Math.max(bottom-top,1e-6);
  const scale=rigMode
    ? Math.min(46,Math.max(0.2,Math.min((w-padX*2)/spanX,(h-padTop-padBottom)/spanY)))
    : Math.min(2.2,(w-86)/spanX,(h-75)/spanY);
  const xx=n=>w/2+(n-(lo+hi)/2)*scale, yy=n=>h/2+(n-(top+bottom)/2)*scale;

  ctx.fillStyle='#161b1e';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#2b3538';ctx.lineWidth=1;
  for(let a=0;a<w;a+=24){ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.stroke();}
  for(let a=0;a<h;a+=24){ctx.beginPath();ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
  ctx.strokeStyle='#748489';ctx.beginPath();ctx.moveTo(0,yy(0));ctx.lineTo(w,yy(0));ctx.stroke();

  // 根轨迹
  ctx.strokeStyle='#71b3b5';ctx.setLineDash([5,6]);ctx.lineWidth=1.4;ctx.beginPath();
  sheet.frames.forEach((frame,i)=>ctx[i?'lineTo':'moveTo'](xx(frame.pose.x),yy(frame.pose.y)));
  ctx.stroke();ctx.setLineDash([]);

  // 作用区：有真实四角就画旋转四边形。
  for(const box of current.boxes) drawBox(ctx,box,xx,yy,scale);

  if(rigMode && current.arm) drawRig(ctx,current,xx,yy);
  else drawLegacyCharacter(ctx,current,sheet.facing,xx,yy,scale);

  ctx.fillStyle='#e1d7bc';ctx.font='15px monospace';
  ctx.fillText(`${sheet.facing.toUpperCase()} / ${sheet.fps} FPS`,18,27);
  if(rigMode){
    const a=current.arm;
    const gripName=a.gripId ?? (typeof a.grip==='string'?a.grip:a.grip?.id) ?? 'wrist';
    const state=a.handoff?(a.holding?' · 交接锁定中':' · 不可达'):' · 原稿手臂动作';
    ctx.fillStyle=a.handoff?'#8ed3ca':'#c9b98f';
    ctx.fillText(`ARM-RIG · 握点 ${gripName}${state}`,18,48);
  }
}

function legacyBounds(sheet){
  const extents=sheet.frames.flatMap(frame=>[frame.pose.x-72,frame.pose.x+72,...frame.boxes.flatMap(box=>[box.x,box.x+box.w])]);
  const top=Math.min(-100,...sheet.frames.flatMap(frame=>[frame.pose.y-100,...frame.boxes.map(box=>box.y)]));
  const bottom=Math.max(0,...sheet.frames.flatMap(frame=>[frame.pose.y+10,...frame.boxes.map(box=>box.y+box.h)]));
  return {lo:Math.min(...extents),hi:Math.max(...extents),top,bottom};
}

function rigBounds(sheet){
  const xs=[],ys=[];
  const push=p=>{if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){xs.push(p.x);ys.push(p.y);}};
  for(const frame of sheet.frames){
    push(frame.pose);
    push(frame.shoulder);push(frame.elbow);push(frame.wrist);push(frame.bracket);
    if(frame.arm?.joints){push(frame.arm.joints.shoulder);push(frame.arm.joints.elbow);push(frame.arm.joints.wrist);}
    for(const box of frame.boxes){
      if(Array.isArray(box.corners)) box.corners.forEach(push);
      else {push({x:box.x,y:box.y});push({x:box.x+box.w,y:box.y+box.h});}
    }
  }
  if(!xs.length){xs.push(0);ys.push(0);}
  return {lo:Math.min(...xs),hi:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
}

function drawBox(ctx,box,xx,yy,scale){
  const corners=box.corners;
  ctx.beginPath();
  if(Array.isArray(corners)&&corners.length===4){
    corners.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](xx(p.x),yy(p.y)));
    ctx.closePath();
  }else{
    ctx.rect(xx(box.x),yy(box.y),box.w*scale,box.h*scale);
  }
  ctx.fillStyle='#f1a25440';ctx.fill();
  ctx.strokeStyle=box.attached?'#ffd08a':'#ffb969';ctx.lineWidth=box.attached?2:1.4;ctx.stroke();
  const labelPoint=Array.isArray(corners)?corners[0]:{x:box.x,y:box.y};
  label(ctx,box.id,xx(labelPoint.x)+4,yy(labelPoint.y)-5,'#ffd9a0');
}

function drawLegacyCharacter(ctx,current,facing,xx,yy,scale){
  const {x,y,arm}=current.pose;
  ctx.save();ctx.translate(xx(x),yy(y));ctx.scale(scale,scale);
  const dir=facing==='left'?-1:1;
  function stroke(points,color,width){
    ctx.beginPath();points.forEach(([a,b],i)=>ctx[i?'lineTo':'moveTo'](a,b));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
  }
  stroke([[-12,0],[-8,-13],[0,-24],[13,-8],[21*dir,0]],'#7ba9aa',6);
  stroke([[0,-25],[0,-48]],'#afd4ca',12);
  ctx.fillStyle='#e9f1df';ctx.beginPath();ctx.arc(4*dir,-60,10,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#182525';ctx.fillRect(6*dir-1,-62,4,3);
  const angle=arm*Math.PI/180;
  stroke([[0,-46],[Math.sin(angle)*32,-46-Math.cos(angle)*32]],'#f5c477',7);
  ctx.restore();
}

function label(ctx,text,x,y,color='#d8e6e2'){
  ctx.font='11px ui-monospace, Menlo, monospace';
  const width=ctx.measureText(text).width;
  ctx.fillStyle='rgba(10,15,17,0.72)';
  ctx.fillRect(x-3,y-11,width+6,15);
  ctx.fillStyle=color;ctx.fillText(text,x,y);
}

function pixelSegment(ctx,a,b,xx,yy,color,width){
  ctx.beginPath();ctx.moveTo(xx(a.x),yy(a.y));ctx.lineTo(xx(b.x),yy(b.y));
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
}

function dot(ctx,p,xx,yy,r,fill,stroke){
  ctx.beginPath();ctx.arc(xx(p.x),yy(p.y),r,0,2*Math.PI);
  ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}

function drawRig(ctx,frame,xx,yy){
  const a=frame.arm;
  const {shoulder:sh,elbow:el,wrist:wr}=frame;

  // 根 → 肩（存在偏移时）
  if(frame.pose && sh && Math.hypot(frame.pose.x-sh.x,frame.pose.y-sh.y)>1e-6){
    pixelSegment(ctx,frame.pose,sh,xx,yy,'#5d6b6e',2);
    dot(ctx,frame.pose,xx,yy,3.5,'#8fa3a6');
    label(ctx,'根',xx(frame.pose.x)+6,yy(frame.pose.y)+14,'#9fb4b7');
  }else if(frame.pose){
    dot(ctx,frame.pose,xx,yy,3,'#5d6b6e');
  }

  // 交接时腕到托架的锁定线（正常情况下长度为 0）。
  if(a.handoff && frame.bracket && wr){
    pixelSegment(ctx,wr,frame.bracket,xx,yy,'#79d1c4',1.6);
  }

  if(el){
    pixelSegment(ctx,sh,el,xx,yy,'#e0a45c',7);
    pixelSegment(ctx,el,wr,xx,yy,'#f3cd85',7);
  }
  dot(ctx,sh,xx,yy,5,'#c98a4b','#f6d9a8');
  label(ctx,'肩',xx(sh.x)+8,yy(sh.y)-8,'#f0c98f');
  if(el){
    dot(ctx,el,xx,yy,5,'#b9823f','#ffe2b0');
    label(ctx,'肘',xx(el.x)+8,yy(el.y)+16,'#f0c98f');
  }
  if(wr){
    if(a.holding){
      ctx.beginPath();ctx.arc(xx(wr.x),yy(wr.y),11,0,2*Math.PI);
      ctx.strokeStyle='rgba(142,211,202,0.55)';ctx.lineWidth=3;ctx.stroke();
    }
    dot(ctx,wr,xx,yy,6,'#17322f','#8ed3ca');
    const gripName=a.gripId ?? (typeof a.grip==='string'?a.grip:a.grip?.id) ?? 'wrist';
    label(ctx,`握点 ${gripName} (${wr.x.toFixed(2)}, ${wr.y.toFixed(2)})`,xx(wr.x)+12,yy(wr.y)-15,'#bff0e8');
  }
  if(frame.bracket) drawBracket(ctx,frame.bracket,xx,yy);
}

function drawBracket(ctx,p,xx,yy){
  const x=xx(p.x),y=yy(p.y),s=9;
  ctx.strokeStyle='#7fc6ef';ctx.lineWidth=2.4;ctx.lineCap='square';
  // 托架：开口向上的 U 形托座 + 底座线。
  ctx.beginPath();
  ctx.moveTo(x-s,y-s);ctx.lineTo(x-s,y+s*0.4);
  ctx.quadraticCurveTo(x-s,y+s,x,y+s);
  ctx.quadraticCurveTo(x+s,y+s,x+s,y+s*0.4);
  ctx.lineTo(x+s,y-s);
  ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-s-3,y+s+3);ctx.lineTo(x+s+3,y+s+3);ctx.stroke();
  // 标签放在托架右下方，避免与上方的握点坐标重叠。
  label(ctx,`托架 (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`,x+12,y+26,'#a9d8f5');
}