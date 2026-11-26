import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from '../server.mjs';
import { decodePack } from '../product/pack.mjs';
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
    pack:async()=>{
      // 每秒 60 帧、全长 8 秒的右向动作：前 7.8 秒根保持 (−32,−4) 且手臂不动，
      // 作用区仅在 7833–7850 ms 开启，7835 与 7844 ms 各有一个事件。
      const doc={ id:'long-recover', duration:8000, fps:60, facing:'right', loop:false,
        keys:[{time:0,x:-32,y:-4,arm:12},{time:7800,x:-32,y:-4,arm:12},{time:8000,x:24,y:0,arm:48}],
        windows:[{id:'burst',from:7833,to:7850,x:10,y:-40,w:30,h:20}],
        events:[{id:'ignite',time:7835,kind:'effect'},{id:'snap',time:7844,kind:'impact'}] };
      const {id}=await save(doc);
      const jsonBytes=await asset(id);
      const sheet=JSON.parse(jsonBytes);
      assert.equal(sheet.frames.length,480);
      assert.equal(sheet.frames[470].events.length,2);
      assert.deepEqual(sheet.frames[470].events.map(event=>event.id),['ignite','snap']);
      assert.equal(sheet.frames[470].boxes.length,1);
      assert.equal(sheet.frames[3].boxes.length,0);
      assert.equal(sheet.frames[3].events.length,0);
      assert.equal(sheet.frames[469].boxes.length,0);
      assert.equal(sheet.frames[469].events.length,0);
      assert.ok(sheet.frames[3].pose.x<0 && sheet.frames[469].pose.x<0);
      const download=await get(`/api/library/${id}/pack`);
      assert.equal(download.status,200);
      assert.equal(download.headers.get('content-type'),metadata.packAsset);
      const packBytes=Buffer.from(await download.arrayBuffer());
      assert.ok(packBytes.length*2<=jsonBytes.length,`冻结包 ${packBytes.length} 字节应不超过 JSON ${jsonBytes.length} 字节的一半`);
      assert.deepEqual(decodePack(packBytes).frames,sheet.frames);
      for(const index of [470,3,469,0,479]) {
        const response=await get(`/api/library/${id}/pack/${index}`);
        assert.equal(response.status,200);
        assert.ok(Number(response.headers.get('content-length'))<=4096,'单帧响应应不超过 4 KiB');
        assert.deepEqual(await response.json(),sheet.frames[index]);
      }
      await read(await get(`/api/library/${id}/pack/480`),404);
      const range=await get(`/api/library/${id}/pack`,{headers:{Range:'bytes=0-31'}});
      assert.equal(range.status,206);
      assert.equal(range.headers.get('content-range'),`bytes 0-31/${packBytes.length}`);
      assert.equal(Buffer.from(await range.arrayBuffer()).toString('hex'),packBytes.subarray(0,32).toString('hex'));
      await close(); await open();
      const frame=await get(`/api/library/${id}/pack/470`);
      assert.deepEqual(await frame.json(),sheet.frames[470]);
      const again=Buffer.from(await (await get(`/api/library/${id}/pack`)).arrayBuffer());
      assert.equal(again.toString('base64'),packBytes.toString('base64'));
      assert.equal((await asset(id)).toString('base64'),jsonBytes.toString('base64'));
    },
    ...checks({document, preview, rejected}),
  };
  const name=process.argv[2]??'proof';
  assert.ok(Object.hasOwn(actions,name),`Unknown workflow: ${name}`);
  await actions[name](); console.log(`Workflow ${name}: OK`);
} finally {
  await close(); await rm(storage,{force:true,recursive:true});
}
