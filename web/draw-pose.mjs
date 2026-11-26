export function figure(ctx,arm,facing) {
  const direction=facing==='right'?1:-1;
  function stroke(points,color,width){
    ctx.beginPath();points.forEach(([a,b],i)=>ctx[i?'lineTo':'moveTo'](a,b));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
  }
  stroke([[-12,0],[-8,-13],[0,-24],[13,-8],[21*direction,0]],'#7ba9aa',6);
  stroke([[0,-25],[0,-48]],'#afd4ca',12);
  ctx.fillStyle='#e9f1df';ctx.beginPath();ctx.arc(4*direction,-60,10,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#182525';ctx.fillRect(6*direction-1,-62,4,3);
  const angle=arm*Math.PI/180;
  stroke([[0,-46],[Math.sin(angle)*32,-46-Math.cos(angle)*32]],'#f5c477',7);
}

export function draw(canvas,sheet,index) {
  const ctx=canvas.getContext('2d'),{width:w,height:h}=canvas;
  const current=sheet.frames[index], {x,y,arm}=current.pose;
  const extents=sheet.frames.flatMap(frame=>[frame.pose.x-72,frame.pose.x+72,...frame.boxes.flatMap(box=>[box.x,box.x+box.w])]);
  const top=Math.min(-100,...sheet.frames.flatMap(frame=>[frame.pose.y-100,...frame.boxes.map(box=>box.y)]));
  const bottom=Math.max(0,...sheet.frames.flatMap(frame=>[frame.pose.y+10,...frame.boxes.map(box=>box.y+box.h)]));
  const lo=Math.min(...extents),hi=Math.max(...extents), scale=Math.min(2.2,(w-86)/(hi-lo),(h-75)/(bottom-top));
  const xx=n=>w/2+(n-(lo+hi)/2)*scale, yy=n=>h/2+(n-(top+bottom)/2)*scale;
  ctx.fillStyle='#161b1e';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#2b3538';ctx.lineWidth=1;
  for(let a=0;a<w;a+=24){ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.stroke();}
  for(let a=0;a<h;a+=24){ctx.beginPath();ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
  ctx.strokeStyle='#748489';ctx.beginPath();ctx.moveTo(0,yy(0));ctx.lineTo(w,yy(0));ctx.stroke();
  ctx.strokeStyle='#71b3b5';ctx.setLineDash([5,6]);ctx.beginPath();
  sheet.frames.forEach((frame,i)=>ctx[i?'lineTo':'moveTo'](xx(frame.pose.x),yy(frame.pose.y)));
  ctx.stroke();ctx.setLineDash([]);
  for(const box of current.boxes){
    ctx.fillStyle='#f1a25440';ctx.strokeStyle='#ffb969';
    ctx.fillRect(xx(box.x),yy(box.y),box.w*scale,box.h*scale);
    ctx.strokeRect(xx(box.x),yy(box.y),box.w*scale,box.h*scale);
  }
  ctx.save();ctx.translate(xx(x),yy(y));ctx.scale(scale,scale);
  figure(ctx,arm,sheet.facing);
  ctx.restore();
  ctx.fillStyle='#e1d7bc';ctx.font='15px monospace';ctx.fillText(`${sheet.facing.toUpperCase()} / ${sheet.fps} FPS`,18,27);
}
