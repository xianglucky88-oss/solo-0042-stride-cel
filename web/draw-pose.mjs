// Camera fitting is derived from the un-nudged geometry (see baseExtent in
// surface.mjs), never from the currently drawn boxes, so dragging a window
// toward an edge does not move the framing. Rebuilt only per compiled sheet.
export function fit(extent, width, height) {
  const {left,right,top,bottom}=extent;
  const scale=Math.min(2.2,(width-86)/(right-left),(height-75)/(bottom-top));
  return {width,height,scale,cx:(left+right)/2,cy:(top+bottom)/2};
}

export function project(view,x,y) {
  return [view.width/2+(x-view.cx)*view.scale,view.height/2+(y-view.cy)*view.scale];
}

export function unproject(view,px,py) {
  return {x:view.cx+(px-view.width/2)/view.scale,y:view.cy+(py-view.height/2)/view.scale};
}

export function draw(canvas,sheet,index,view,state={}) {
  const {boxes=sheet.frames[index].boxes,selected=null,ghost=null}=state;
  const ctx=canvas.getContext('2d'),{width:w,height:h}=canvas;
  const current=sheet.frames[index], {x,y,arm}=current.pose;
  const xx=n=>project(view,n,0)[0], yy=n=>project(view,0,n)[1];
  ctx.fillStyle='#161b1e';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#2b3538';ctx.lineWidth=1;
  for(let a=0;a<w;a+=24){ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.stroke();}
  for(let a=0;a<h;a+=24){ctx.beginPath();ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
  ctx.strokeStyle='#748489';ctx.beginPath();ctx.moveTo(0,yy(0));ctx.lineTo(w,yy(0));ctx.stroke();
  ctx.strokeStyle='#71b3b5';ctx.setLineDash([5,6]);ctx.beginPath();
  sheet.frames.forEach((frame,i)=>ctx[i?'lineTo':'moveTo'](xx(frame.pose.x),yy(frame.pose.y)));
  ctx.stroke();ctx.setLineDash([]);
  if(ghost) {
    // Where the box was before this drag, so the move reads against the start.
    ctx.strokeStyle='#8b9a9c';ctx.setLineDash([3,4]);ctx.lineWidth=1;
    ctx.strokeRect(xx(ghost.x),yy(ghost.y),ghost.w*view.scale,ghost.h*view.scale);
    ctx.setLineDash([]);
  }
  for(const box of boxes){
    const isSelected=selected===box.id;
    ctx.fillStyle=isSelected?'#f1a25478':'#f1a25440';
    ctx.strokeStyle=isSelected?'#ffe0ad':'#ffb969';
    ctx.lineWidth=isSelected?2:1;
    ctx.fillRect(xx(box.x),yy(box.y),box.w*view.scale,box.h*view.scale);
    ctx.strokeRect(xx(box.x),yy(box.y),box.w*view.scale,box.h*view.scale);
    ctx.lineWidth=1;
  }
  ctx.save();ctx.translate(xx(x),yy(y));ctx.scale(view.scale,view.scale);
  const facing=sheet.facing==='right'?1:-1;
  function stroke(points,color,width){
    ctx.beginPath();points.forEach(([a,b],i)=>ctx[i?'lineTo':'moveTo'](a,b));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
  }
  stroke([[-12,0],[-8,-13],[0,-24],[13,-8],[21*facing,0]],'#7ba9aa',6);
  stroke([[0,-25],[0,-48]],'#afd4ca',12);
  ctx.fillStyle='#e9f1df';ctx.beginPath();ctx.arc(4*facing,-60,10,0,2*Math.PI);ctx.fill();
  ctx.fillStyle='#182525';ctx.fillRect(6*facing-1,-62,4,3);
  const angle=arm*Math.PI/180;
  stroke([[0,-46],[Math.sin(angle)*32,-46-Math.cos(angle)*32]],'#f5c477',7);
  ctx.restore();
  ctx.fillStyle='#e1d7bc';ctx.font='15px monospace';ctx.fillText(`${sheet.facing.toUpperCase()} / ${sheet.fps} FPS`,18,27);
  if(selected) { ctx.fillStyle='#ffe0ad'; ctx.font='12px monospace'; ctx.fillText(`已选作用区：${selected}`,18,47); }
}
