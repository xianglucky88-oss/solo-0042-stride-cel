import { mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, digest } from './canonical.mjs';
import { publishFile } from './atomic-write.mjs';
import { InputError } from './input.mjs';
import { PACK_HEADER_SIZE, decodePackFrame, parsePackHeader, parsePackStrings } from '../product/pack.mjs';

const validId = /^[a-f0-9]{64}$/;

export async function openLibrary(directory, metadata) {
  await mkdir(directory, { recursive: true });
  const file = id => join(directory, `${id}.json`);
  const packFile = id => join(directory, `${id}.${metadata.packSuffix}`);
  async function load(id) {
    if (!validId.test(id)) throw new InputError('未知的版本标识', 404);
    try {
      const raw = await readFile(file(id));
      if (digest(raw) !== id) throw new InputError('版本内容校验失败', 409);
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') throw new InputError('版本不存在', 404);
      throw error;
    }
  }
  async function packRecord(id) {
    const record = await load(id);
    if (!record.pack) throw new InputError('该版本没有冻结包', 404);
    return record;
  }
  async function packLocation(id) {
    const record = await packRecord(id);
    let info;
    try {
      info = await stat(packFile(id));
    } catch (error) {
      if (error.code === 'ENOENT') throw new InputError('冻结包不存在', 404);
      throw error;
    }
    if (info.size !== record.pack.bytes) throw new InputError('冻结包内容校验失败', 409);
    return { path: packFile(id), size: info.size };
  }
  const corrupt = () => new InputError('冻结包内容校验失败', 409);
  return {
    load,
    packLocation,
    async keep(document, rendered) {
      const pack = { bytes: rendered.pack.length, sha256: digest(rendered.pack) };
      const raw = canonical({ version: metadata.version, document, summary: rendered.summary, pack, base64: rendered.bytes.toString('base64') });
      const id = digest(raw);
      await publishFile(packFile(id), rendered.pack);
      const created = await publishFile(file(id), raw);
      if (!created) await load(id);
      return { id, summary: rendered.summary, created };
    },
    async readPack(id) {
      const record = await packRecord(id);
      let bytes;
      try {
        bytes = await readFile(packFile(id));
      } catch (error) {
        if (error.code === 'ENOENT') throw new InputError('冻结包不存在', 404);
        throw error;
      }
      if (digest(bytes) !== record.pack.sha256) throw corrupt();
      return bytes;
    },
    // 只按偏移读出包头、字符串表、一条索引和目标帧记录，绝不整包读入再截帧。
    async readPackFrame(id, index) {
      const record = await packRecord(id);
      let handle;
      try {
        handle = await open(packFile(id), 'r');
      } catch (error) {
        if (error.code === 'ENOENT') throw new InputError('冻结包不存在', 404);
        throw error;
      }
      try {
        const { size } = await handle.stat();
        if (size !== record.pack.bytes) throw corrupt();
        const slice = async (position, length) => {
          const buffer = Buffer.allocUnsafe(length);
          const { bytesRead } = await handle.read(buffer, 0, length, position);
          if (bytesRead !== length) throw corrupt();
          return buffer;
        };
        const header = parsePackHeader(await slice(0, PACK_HEADER_SIZE));
        if (header.indexOffset < PACK_HEADER_SIZE || header.framesOffset < header.indexOffset || header.framesOffset > size) throw corrupt();
        if (!Number.isInteger(index) || index < 0 || index >= header.frameCount) throw new InputError('帧不存在', 404);
        const { strings } = parsePackStrings(await slice(PACK_HEADER_SIZE, header.indexOffset - PACK_HEADER_SIZE), header.stringCount, 0);
        const entry = await slice(header.indexOffset + index * 4, 8);
        const start = entry.readUInt32LE(0), end = entry.readUInt32LE(4);
        if (start < header.framesOffset || end <= start || end > size) throw corrupt();
        return decodePackFrame(header, strings, await slice(start, end - start), index);
      } catch (error) {
        if (error instanceof InputError) throw error;
        throw corrupt();
      } finally {
        await handle.close();
      }
    },
    async recent() {
      const filenames = (await readdir(directory)).filter(name => validId.test(name.slice(0,-5)) && name.endsWith('.json'));
      const times = await Promise.all(filenames.map(async name => ({
        id: name.slice(0,-5), time: (await stat(join(directory, name))).mtimeMs,
      })));
      return times.sort((a,b) => b.time-a.time || a.id.localeCompare(b.id)).slice(0,20);
    },
  };
}
