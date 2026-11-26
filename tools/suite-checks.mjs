import assert from 'node:assert/strict';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const draft = {
  id: 'suite-probe', duration: 200, fps: 30, facing: 'right', loop: false,
  keys: [{ time: 0, x: 0, y: 0, arm: 0 }, { time: 200, x: 20, y: 0, arm: 10 }],
  windows: [
    { id: 'hit', from: 40, to: 75, x: 10, y: -10, w: 20, h: 20 },
    { id: 'wide', from: 0, to: 200, x: 0, y: 0, w: 10, h: 10 },
  ],
  events: [{ id: 'tap', time: 50, kind: 'impact' }],
};

export function suiteChecks({ send, get, read, storage, restart }) {
  const freezeSuite = async (payload, status = 201) => read(await send('/api/suites', payload), status);
  const suiteFiles = () => readdir(storage).then(names => names.filter(name => name.startsWith('suite-')));
  const standalone = async (fps, facing) =>
    (await read(await send('/api/preview', { ...draft, fps, facing }))).base64;

  return {
    suite: async () => {
      // Two rates, both facings: four individually engine-ready frame tables.
      const created = await freezeSuite({ document: draft, rates: [30, 12], require: [] });
      assert.equal(created.variants.length, 4);
      assert.deepEqual(created.rates, [12, 30]);
      assert.deepEqual(created.variants.map(v => [v.fps, v.facing]),
        [[12, 'left'], [12, 'right'], [30, 'left'], [30, 'right']]);

      // Every variant byte-for-byte matches a standalone freeze of the same
      // draft, frame rate and facing.
      for (const variant of created.variants) {
        const response = await get(`/api/suites/${created.id}/${variant.fps}-${variant.facing}/asset`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-disposition') ?? '', /attachment/);        const bytes = Buffer.from(await response.arrayBuffer()).toString('base64');
        assert.equal(bytes, await standalone(variant.fps, variant.facing));
      }

      // One fixed version number retrieves the specs of all four products.
      const record = await read(await get(`/api/suites/${created.id}`));
      assert.equal(record.variants.length, 4);
      assert.equal(record.document.id, draft.id);
      assert.deepEqual((await read(await get('/api/suites'))).map(row => row.id), [created.id]);

      // Reversed rate order and reversed request shape resolve to the same id.
      assert.equal((await freezeSuite({ rates: [12, 30], require: [], document: draft }, 200)).id, created.id);
      const rotated = Object.fromEntries(Object.entries({ document: draft, rates: [30, 12], require: [] }).reverse());
      assert.equal((await freezeSuite(rotated, 200)).id, created.id);

      // Two people freezing the same delivery concurrently create it once.
      // Use a fresh rate pair so the record does not exist before the race.
      const [a, b] = await Promise.all([
        send('/api/suites', { document: draft, rates: [30, 10] }),
        send('/api/suites', { document: draft, rates: [10, 30] }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 201]);
      assert.equal((await a.json()).id, (await b.json()).id);

      // Bad requests are rejected without touching the store.
      const before = await suiteFiles();
      await read(await send('/api/suites', { document: draft, rates: [30, 30] }), 422);
      await read(await send('/api/suites', { document: draft, rates: [30, 12], require: ['ghost'] }), 422);
      await read(await send('/api/suites', { document: { ...draft, keys: draft.keys.slice(1) }, rates: [30, 12] }), 422);
      await read(await get(`/api/suites/${created.id}/24-left/asset`), 404);
      assert.deepEqual(await suiteFiles(), before);
    },

    'suite-missing': async () => {
      // hit is active from 40 ms and closes at 75 ms: a 30 fps sheet samples
      // 66.7 ms, while 12 fps only samples 0 / 83.3 / 166.7 ms.
      const failure = await read(await send('/api/suites', { document: draft, rates: [30, 12], require: ['hit'] }), 422);
      assert.match(failure.error, /必需作用区/);
      assert.deepEqual(failure.missing, [
        { fps: 12, facing: 'left', windows: ['hit'] },
        { fps: 12, facing: 'right', windows: ['hit'] },
      ]);
      // The failed freeze leaves no openable half suite on disk.
      assert.deepEqual(await suiteFiles().then(files => files.filter(name => name.endsWith('.json'))), []);
      assert.deepEqual(await read(await get('/api/suites')), []);
      // The draft itself remains previewable.
      assert.equal((await read(await send('/api/preview', draft))).summary.id, draft.id);

      // Moving only the close time to 90 ms removes the gap; one version now
      // covers all four downloadable products.
      const fixed = { ...draft, windows: draft.windows.map(w => w.id === 'hit' ? { ...w, to: 90 } : w) };
      const created = await freezeSuite({ document: fixed, rates: [30, 12], require: ['hit'] });
      const record = await read(await get(`/api/suites/${created.id}`));
      assert.equal(record.variants.length, 4);
      for (const variant of record.variants) {
        const response = await get(`/api/suites/${created.id}/${variant.fps}-${variant.facing}/asset`);
        assert.equal(response.status, 200);
      }
    },

    'suite-reopen': async () => {
      const created = await freezeSuite({ document: draft, rates: [30, 12], require: ['wide'] });
      const before = await Promise.all(created.variants.map(v =>
        get(`/api/suites/${created.id}/${v.fps}-${v.facing}/asset`).then(r => r.arrayBuffer())));
      // A standalone freeze link checked out earlier keeps working as well.
      const single = await read(await send('/api/library', { ...draft, fps: 24, facing: 'right' }), 201);

      await restart();

      const record = await read(await get(`/api/suites/${created.id}`));
      assert.equal(record.variants.length, 4);
      const after = await Promise.all(created.variants.map(v =>
        get(`/api/suites/${created.id}/${v.fps}-${v.facing}/asset`).then(r => r.arrayBuffer())));
      before.forEach((buffer, i) => assert.deepEqual(Buffer.from(after[i]), Buffer.from(buffer)));
      const legacy = await get(`/api/library/${single.id}/asset`);
      assert.equal(legacy.status, 200);
    },

    'suite-integrity': async () => {
      const created = await freezeSuite({ document: draft, rates: [30, 12] });
      await writeFile(join(storage, `suite-${created.id}.json`), '{}');
      await read(await get(`/api/suites/${created.id}`), 409);
      await read(await get(`/api/suites/${created.id}/30-left/asset`), 409);
    },
  };
}
