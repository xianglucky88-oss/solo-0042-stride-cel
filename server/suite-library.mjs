import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest } from './canonical.mjs';
import { publishFile } from './atomic-write.mjs';
import { InputError } from './input.mjs';

const validId = /^[a-f0-9]{64}$/;

// Suites live beside single assets but use a distinct prefix so a suite id can
// never collide with a single-freeze record.
export async function openSuiteLibrary(directory, metadata) {
  await mkdir(directory, { recursive: true });
  const finalPath = id => join(directory, `suite-${id}.json`);

  function parse(raw, id) {
    if (digest(raw) !== id) throw new InputError('套件内容校验失败', 409);
    return JSON.parse(raw);
  }

  async function load(id) {
    if (!validId.test(id)) throw new InputError('未知的套件标识', 404);
    try {
      return parse(await readFile(finalPath(id)), id);
    } catch (error) {
      if (error.code === 'ENOENT') throw new InputError('套件不存在', 404);
      throw error;
    }
  }

  return {
    load,
    async keep(suite) {
      // The record is content-addressed: swapping the rate order, reordering
      // the request object or re-submitting identical content yields the same
      // canonical bytes and therefore the same suite id. A rejected freeze
      // throws before this point, and publishFile only ever materializes a
      // complete record via temp file plus exclusive hard link, so no openable
      // half suite can remain after a failure.
      const record = {
        version: metadata.version,
        format: 'stride-cel-suite/1',
        document: suite.draft,
        rates: suite.rates,
        required: suite.required,
        variants: suite.variants,
      };
      const raw = canonical(record);
      const id = digest(raw);
      const created = await publishFile(finalPath(id), raw);
      if (!created) await load(id);
      return { id, rates: suite.rates, required: suite.required, variants: suite.variants.map(variantEntry), created };
    },
    async recent() {
      const filenames = (await readdir(directory))
        .filter(name => name.startsWith('suite-') && name.endsWith('.json'));
      const times = await Promise.all(filenames.map(async name => {
        const id = name.slice('suite-'.length, -'.json'.length);
        return { id, time: (await stat(join(directory, name))).mtimeMs };
      }));
      return times.sort((a, b) => b.time - a.time || a.id.localeCompare(b.id)).slice(0, 20);
    },
  };
}

function variantEntry(variant) {
  return { fps: variant.fps, facing: variant.facing, summary: variant.summary };
}
