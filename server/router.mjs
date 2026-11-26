import { createReadStream } from 'node:fs';
import { readDocument } from './request-body.mjs';
import { json, send } from './responses.mjs';
import { servePage } from './static.mjs';
import { InputError } from './input.mjs';

export function makeRouter(product, library) {
  const { metadata, demo, render, normalize } = product;
  async function sendPack(req, res, id) {
    const range = req.headers.range;
    if (range) {
      // 引擎可按字节范围直接取包头、索引或单帧记录，服务端按偏移流式读取。
      const { path, size } = await library.packLocation(id);
      const unit = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = unit ? Number(unit[1]) : 0;
      const end = unit ? (unit[2] ? Math.min(Number(unit[2]), size - 1) : size - 1) : -1;
      if (!unit || start > end || start >= size) throw new InputError('范围不可用', 416);
      res.writeHead(206, {
        'Content-Type': metadata.packAsset,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      return createReadStream(path, { start, end }).pipe(res);
    }
    const bytes = await library.readPack(id);
    return send(res, 200, bytes, metadata.packAsset, {
      'Content-Disposition': `attachment; filename="${metadata.slug}-${id.slice(0,12)}.${metadata.packSuffix}"`,
      'Accept-Ranges': 'bytes',
    });
  }
  return async function route(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    const method = req.method;
    if (method === 'GET' && !pathname.startsWith('/api/')) return servePage(pathname, res);
    if (method === 'GET' && pathname === '/api/demo') return json(res, { metadata, document: demo() });
    if (method === 'GET' && pathname === '/api/library') return json(res, await library.recent());
    if (method === 'POST' && ['/api/preview', '/api/library'].includes(pathname)) {
      // A browser hosted elsewhere cannot mutate the local project store.
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new InputError('请求不是来自当前工作台', 403);
      const document = normalize(await readDocument(req));
      const rendered = render(document);
      if (pathname === '/api/preview') return json(res, { summary: rendered.summary, base64: rendered.bytes.toString('base64') });
      const saved = await library.keep(document, rendered);
      return json(res, saved, saved.created ? 201 : 200);
    }
    const match = /^\/api\/library\/([a-f0-9]{64})(?:\/(asset|pack)(?:\/(\d{1,10}))?)?$/.exec(pathname);
    if (method === 'GET' && match) {
      const [, id, kind, frame] = match;
      if (kind === 'pack') {
        if (frame !== undefined) return json(res, await library.readPackFrame(id, Number(frame)));
        return sendPack(req, res, id);
      }
      const { base64, ...record } = await library.load(id);
      if (!kind) return json(res, record);
      return send(res, 200, Buffer.from(base64, 'base64'), metadata.asset, {
        'Content-Disposition': `attachment; filename="${metadata.slug}-${id.slice(0,12)}.${metadata.suffix}"`,
      });
    }
    throw new InputError('接口不存在', 404);
  };
}
