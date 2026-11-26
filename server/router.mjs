import { readDocument } from './request-body.mjs';
import { json, send } from './responses.mjs';
import { servePage } from './static.mjs';
import { InputError } from './input.mjs';
import { buildSuite } from '../product/suite.mjs';

const sameOrigin = req =>
  !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;

export function makeRouter(product, library, suites) {
  const { metadata, demo, render, normalize } = product;
  return async function route(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    const method = req.method;
    if (method === 'GET' && !pathname.startsWith('/api/')) return servePage(pathname, res);
    if (method === 'GET' && pathname === '/api/demo') return json(res, { metadata, document: demo() });
    if (method === 'GET' && pathname === '/api/library') return json(res, await library.recent());
    if (method === 'GET' && pathname === '/api/suites') return json(res, await suites.recent());

    if (method === 'POST' && ['/api/preview', '/api/library'].includes(pathname)) {
      // A browser hosted elsewhere cannot mutate the local project store.
      if (!sameOrigin(req)) throw new InputError('请求不是来自当前工作台', 403);
      const document = normalize(await readDocument(req));
      const rendered = render(document);
      if (pathname === '/api/preview') return json(res, { summary: rendered.summary, base64: rendered.bytes.toString('base64') });
      const saved = await library.keep(document, rendered);
      return json(res, saved, saved.created ? 201 : 200);
    }

    if (method === 'POST' && pathname === '/api/suites') {
      if (!sameOrigin(req)) throw new InputError('请求不是来自当前工作台', 403);
      // A failed build (bad draft or required window missing) throws before any
      // record is written, so no half suite is ever published; the draft itself
      // stays previewable through /api/preview.
      const suite = buildSuite(await readDocument(req));
      const saved = await suites.keep(suite);
      return json(res, saved, saved.created ? 201 : 200);
    }

    const suiteAsset = /^\/api\/suites\/([a-f0-9]{64})\/((?:\d+)-(?:left|right))\/asset$/.exec(pathname);
    if (method === 'GET' && suiteAsset) {
      const record = await suites.load(suiteAsset[1]);
      const variant = record.variants.find(row => `${row.fps}-${row.facing}` === suiteAsset[2]);
      if (!variant) throw new InputError('套件中没有该成品', 404);
      return send(res, 200, Buffer.from(variant.base64, 'base64'), metadata.asset, {
        'Content-Disposition': `attachment; filename="${metadata.slug}-${suiteAsset[1].slice(0, 12)}-${suiteAsset[2]}.${metadata.suffix}"`,
      });
    }

    const suiteMatch = /^\/api\/suites\/([a-f0-9]{64})$/.exec(pathname);
    if (method === 'GET' && suiteMatch) {
      const record = await suites.load(suiteMatch[1]);
      return json(res, {
        id: suiteMatch[1],
        format: record.format,
        document: record.document,
        rates: record.rates,
        required: record.required,
        variants: record.variants.map(row => ({ fps: row.fps, facing: row.facing, summary: row.summary })),
      });
    }

    const match = /^\/api\/library\/([a-f0-9]{64})(?:\/(asset))?$/.exec(pathname);
    if (method === 'GET' && match) {
      const { base64, ...record } = await library.load(match[1]);
      if (!match[2]) return json(res, record);
      return send(res, 200, Buffer.from(base64, 'base64'), metadata.asset, {
        'Content-Disposition': `attachment; filename="${metadata.slug}-${match[1].slice(0,12)}.${metadata.suffix}"`,
      });
    }
    throw new InputError('接口不存在', 404);
  };
}
