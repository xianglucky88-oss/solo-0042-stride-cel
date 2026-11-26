import assert from 'node:assert/strict';

const sheet=result=>JSON.parse(Buffer.from(result.base64,'base64'));

export function checks({document,preview,rejected}) {
  return {
    proof:async()=>{
      const compiled=sheet(await preview());
      assert.equal(compiled.frames.length,21);
      assert.equal(compiled.frames[0].pose.x,0);
      assert.ok(Math.abs(compiled.frames[3].pose.x-12*125/170)<1e-9);
      await rejected({...document,keys:document.keys.slice(1)});
    },
    mirror:async()=>{
      const a=sheet(await preview()),b=sheet(await preview({...document,facing:'left'}));
      const frame=a.frames.find(row=>row.boxes.length), mirrored=b.frames[frame.index];
      assert.equal(mirrored.pose.x,-frame.pose.x);
      assert.equal(mirrored.pose.arm,-frame.pose.arm);
      assert.equal(mirrored.boxes[0].x,-frame.boxes[0].x-frame.boxes[0].w);
      await rejected({...document,facing:'up'});
    },
    windows:async()=>{
      const windows=[{...document.windows[0],from:50,to:100},{...document.windows[1],from:21,to:40}];
      const result=sheet(await preview({...document,fps:20,windows}));
      assert.equal(result.frames[1].boxes[0].id,windows[0].id);
      assert.equal(result.frames[2].boxes.length,0);
      assert.deepEqual(result.unsampled,[windows[1].id]);
      await rejected({...document,windows:[{...windows[0],to:50}]});
    },
    events:async()=>{
      const events=[{id:'a',kind:'step',time:49},{id:'b',kind:'impact',time:50}];
      const result=sheet(await preview({...document,fps:20,events}));
      assert.equal(result.frames[0].events[0].offset,49);
      assert.equal(result.frames[1].events[0].offset,0);
      await rejected({...document,events:[{...events[0],time:document.duration}]});
    },
    seam:async()=>{
      const right=sheet(await preview());assert.equal(right.continuity.loopClean,true);
      assert.equal(right.continuity.cycleTravel.x,105);
      const keys=structuredClone(document.keys);keys.at(-1).y=5;
      assert.equal(sheet(await preview({...document,keys})).continuity.loopClean,false);
      assert.equal(sheet(await preview({...document,keys,loop:false})).continuity.loopClean,null);
    },
    audible:async()=>{
      const keys=[{time:0,x:-80,y:0,arm:0},{time:20,x:-40,y:10,arm:0},{time:70,x:40,y:10,arm:0},{time:100,x:-80,y:0,arm:0}];
      const events=[{id:'left',kind:'step',time:20,sound:true},{id:'quiet',kind:'impact',time:50},{id:'right',kind:'step',time:70,sound:true}];
      const doc={...document,duration:100,fps:10,windows:[],keys,events};
      const locate=(result,id)=>result.frames.findIndex(frame=>frame.events.some(event=>event.id===id));
      const find=(result,id)=>result.frames.flatMap(frame=>frame.events).find(event=>event.id===id);
      const first=await preview(doc), right=sheet(first);
      assert.equal(first.summary.audible,2);
      // 10 FPS：两步记在同一帧里，帧归属与帧内偏移不变
      assert.equal(locate(right,'left'),0);
      assert.equal(locate(right,'right'),0);
      assert.equal(find(right,'left').offset,20);
      assert.equal(find(right,'right').offset,70);
      // 世界坐标取脚步发生那一刻的根位置，帧间关键姿态计入
      assert.deepEqual(find(right,'left').position,{x:-40,y:10});
      assert.deepEqual(find(right,'right').position,{x:40,y:10});
      // 未标记的事件不发声也不交付坐标
      assert.equal(find(right,'quiet').sound,false);
      assert.ok(!('position' in find(right,'quiet')));
      // 换向后两声的左右对调
      const mirrored=sheet(await preview({...doc,facing:'left'}));
      assert.equal(find(mirrored,'left').position.x,40);
      assert.equal(find(mirrored,'right').position.x,-40);
      // 改帧率让两步不再同帧：发声时刻与落点不变
      const finer=sheet(await preview({...doc,fps:20}));
      assert.equal(locate(finer,'left'),0);
      assert.equal(locate(finer,'right'),1);
      assert.deepEqual(find(finer,'left').position,{x:-40,y:10});
      assert.deepEqual(find(finer,'right').position,{x:40,y:10});
      for(const result of [right,finer]) for(const frame of result.frames) for(const event of frame.events)
        assert.ok(Math.abs(frame.time+event.offset-event.time)<1e-9);
      await rejected({...doc,events:[{id:'bad',kind:'step',time:20,sound:'yes'}]});
    },
  };
}
