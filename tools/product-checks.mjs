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
    holds:async()=>{
      const doc={ id:'hold-check', duration:450, fps:10, facing:'right', loop:false,
        keys:[{time:0,x:0,y:0,arm:0},{time:450,x:90,y:0,arm:90}],
        windows:[{id:'hit',from:150,to:170,x:0,y:0,w:10,h:10}],
        events:[{id:'trail',time:160,kind:'effect'},
          {id:'impact',time:150,kind:'impact',clock:'action'},
          {id:'spark',time:200,kind:'effect',clock:'game'},
          {id:'echo',time:280,kind:'step',clock:'game'}],
        holds:[{at:150,duration:130}] };
      const result=sheet(await preview(doc));
      assert.equal(result.frames.length,6);
      assert.deepEqual(result.holds,[{at:150,duration:130}]);
      const frame=result.frames[2];
      assert.equal(frame.time,200);
      assert.equal(frame.at,150);
      assert.equal(frame.pose.x,30);
      assert.equal(frame.boxes[0]?.id,'hit');
      assert.deepEqual(frame.events.map(evt=>evt.id),['spark','echo','impact','trail']);
      assert.deepEqual(frame.events.map(evt=>evt.offset),[0,80,80,90]);
      assert.deepEqual(frame.events.map(evt=>evt.clock),['game','game','action','action']);
      assert.equal(frame.events[2].time,150);
      assert.equal(result.frames[3].at,170);
      assert.equal(result.frames[3].boxes.length,0);
      assert.deepEqual(result.frames.flatMap(row=>row.events.map(evt=>evt.id)).sort(),['echo','impact','spark','trail']);
      const tail=sheet(await preview({...doc,events:[{id:'last',time:449,kind:'step',clock:'action'}]}));
      assert.equal(tail.frames.length,6);
      assert.equal(tail.frames[5].events[0]?.id,'last');
      assert.equal(tail.frames[5].events[0]?.offset,79);
      const plain=sheet(await preview());
      assert.equal(plain.holds,undefined);
      assert.equal(plain.frames[2].at,undefined);
      assert.equal(plain.frames[3].events[0]?.clock,undefined);
      await rejected({...doc,holds:[{at:450,duration:10}]});
      await rejected({...doc,holds:[{at:100,duration:10},{at:100,duration:20}]});
      await rejected({...doc,events:[{id:'x',time:100,kind:'step',clock:'flash'}]});
      await rejected({...doc,events:[{id:'x',time:580,kind:'step',clock:'game'}]});
      await rejected({...doc,events:[{id:'x',time:450,kind:'step',clock:'action'}]});
    },
  };
}
