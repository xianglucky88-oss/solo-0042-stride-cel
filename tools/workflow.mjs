import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../server.mjs';
import { checks } from './product-checks.mjs';

const storage=await mkdtemp(join(tmpdir(),'media-workflow-'));
let server;
async function open() { server=await start({port:0,storage}); }
async function close() { if (server?.listening) await new Promise(resolve=>server.close(resolve)); }
function get(path,options) { return fetch(`http://127.0.0.1:${server.address().port}${path}`,options); }
const send=(path,document)=>get(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(document)});
const read=async(response,status=200)=>{
  const body=await response.json(); assert.equal(response.status,status,JSON.stringify(body).slice(0,240)); return body;
};
try {
  await open();
  const {document,metadata}=await read(await get('/api/demo'));
  const preview=async(doc=document)=>read(await send('/api/preview',doc));
  const rejected=async doc=>read(await send('/api/preview',doc),422);
  const save=async(doc=document,status=201)=>read(await send('/api/library',doc),status);
  const asset=async id=>{
    const response=await get(`/api/library/${id}/asset`);
    assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),metadata.asset);
    return Buffer.from(await response.arrayBuffer());
  };
  const actions={
    import:async()=>{
      assert.equal((await get('/')).status,200);
      assert.match(await (await get('/')).text(),new RegExp(metadata.title));
      await preview();
      const bad=await get('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{' });
      await read(bad,400); await rejected({});
    },
    freeze:async()=>{
      const [a,b]=await Promise.all([send('/api/library',document),send('/api/library',document)]);
      assert.deepEqual([a.status,b.status].sort(),[200,201]);
      const [first,second]=await Promise.all([a.json(),b.json()]);
      assert.equal(first.id,second.id);
      const rotated=Object.fromEntries(Object.entries(document).reverse());
      assert.equal((await save(rotated,200)).id,first.id);
    },
    download:async()=>{
      const {id}=await save(); const first=await preview();
      assert.equal((await asset(id)).toString('base64'),first.base64);
      await read(await get(`/api/library/${'a'.repeat(64)}/asset`),404);
    },
    reopen:async()=>{
      const {id}=await save(); await close(); await open();
      const record=await read(await get(`/api/library/${id}`));
      assert.equal(record.document.id,document.id);
      assert.equal(record.summary.id,document.id);
      assert.equal((await read(await get('/api/library')))[0].id,id);
    },
    integrity:async()=>{
      const {id}=await save();
      await writeFile(join(storage,`${id}.json`),'{}');
      await read(await get(`/api/library/${id}`),409);
      await read(await get(`/api/library/${id}/asset`),409);
    },
    ...checks({document, preview, rejected}),
    adjust:async()=>{
      // A window nudge is scoped to the selected frames' *action time*, stored
      // relative to the character root. Reproduce the brief's worked example.
      const base={...document,duration:1000,fps:30,loop:false,facing:'left',
        keys:[{time:0,x:0,y:0,arm:0},{time:1000,x:0,y:0,arm:0}],
        windows:[{id:'sweep',from:0,to:1000,x:10,y:-20,w:50,h:30},
          {id:'heel',from:0,to:1000,x:100,y:0,w:20,h:20}],
        events:[]};
      const flat=async doc=>JSON.parse(Buffer.from((await preview(doc)).base64,'base64'));
      const before30=await flat(base);
      // Select the 2nd and 3rd sampled frames: [1000/30, 100) ms.
      const from=before30.frames[1].time, to=before30.frames[3].time;
      assert.equal(from,1000/30); assert.equal(to,100);
      // Dragged 20 scene px to the right in a left-facing proof: local X flips.
      const drag={window:'sweep',from,to,dx:-20,dy:0};
      const after30=await flat({...base,adjustments:[drag]});
      const shift=(a,b,index)=>a.frames[index].boxes[0].x-b.frames[index].boxes[0].x;
      assert.deepEqual([0,1,2,3].map(i=>shift(after30,before30,i)),[0,20,20,0]);
      // Size, window name and the other window are untouched.
      assert.equal(after30.frames[1].boxes[0].w,before30.frames[1].boxes[0].w);
      assert.equal(after30.frames[1].boxes[0].id,'sweep');
      assert.deepEqual(after30.frames[1].boxes[1],before30.frames[1].boxes[1]);
      // Open/close timing never changes.
      assert.deepEqual(after30.frames.map(f=>f.boxes.map(b=>b.id)),before30.frames.map(f=>f.boxes.map(b=>b.id)));
      // Re-sampling at 60 FPS keeps the same real span: 50 ms still +20,
      // 100 ms untouched, because the boundary is exact rather than rounded.
      const before60=await flat({...base,fps:60}), after60=await flat({...base,fps:60,adjustments:[drag]});
      const at=(sheet,time)=>sheet.frames.find(frame=>Math.abs(frame.time-time)<1e-9).index;
      assert.equal(shift(after60,before60,at(before60,50)),20);
      assert.equal(shift(after60,before60,at(before60,100)),0);
      // Flipping to right-facing mirrors the stored local delta.
      const beforeR=await flat({...base,facing:'right'}), afterR=await flat({...base,facing:'right',adjustments:[drag]});
      assert.equal(shift(afterR,beforeR,at(beforeR,1000/30)),-20);
      // A later, partially overlapping span only adds where they overlap.
      const second={window:'sweep',from:1000/30*2,to:1000/30*4,dx:-7,dy:0};
      const twice=await flat({...base,adjustments:[drag,second]});
      assert.deepEqual([1,2,3].map(i=>shift(twice,before30,i)),[20,27,7]);
      // Validation: unknown window or empty span is refused.
      await rejected({...base,adjustments:[{...drag,to:from}]});
      await rejected({...base,adjustments:[{...drag,window:'nope'}]});
      // Freeze, download and reopen all reproduce the change without renaming.
      const original=await save(base,201);
      const originalBytes=await asset(original.id);
      const frozen=await save({...base,adjustments:[drag]},201);
      assert.notEqual(frozen.id,original.id);
      const frozenBytes=await asset(frozen.id);
      const frozenSheet=JSON.parse(frozenBytes);
      assert.equal(frozenSheet.frames[1].boxes[0].id,'sweep');
      assert.equal(frozenSheet.frames[1].boxes[0].x-before30.frames[1].boxes[0].x,20);
      await close(); await open();
      const record=await read(await get(`/api/library/${frozen.id}`));
      assert.deepEqual(record.document.adjustments,[drag]);
      assert.deepEqual(await asset(frozen.id),frozenBytes);
      assert.deepEqual(await asset(original.id),originalBytes);
    },
  };
  const name=process.argv[2]??'proof';
  assert.ok(Object.hasOwn(actions,name),`Unknown workflow: ${name}`);
  await actions[name](); console.log(`Workflow ${name}: OK`);
} finally {
  await close(); await rm(storage,{force:true,recursive:true});
}
