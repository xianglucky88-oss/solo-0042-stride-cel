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
  };
}
