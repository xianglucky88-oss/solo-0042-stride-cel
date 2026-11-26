// 轻量冻结包：自带帧索引的二进制帧表。凭帧号读出包头、字符串表和一条索引
// 即可直接定位并解出该帧，不必读完整个包或顺序解码此前所有帧，也不回源草稿重算。
// 数值一律按 float64 存储，与 JSON 产物逐帧完全一致（JSON 会丢掉负零，打包前统一为正零）。
//
// 布局（整数均为小端）：
//   包头 32 字节：magic "SCELPK01" | u32 帧数 | u32 帧率 | u32 时长 |
//     u8 朝向(0右1左) | u8 循环 | u16 字符串数 | u32 索引偏移 | u32 帧区偏移
//   字符串区：u8 长度+动作标识，随后每条字符串 u8 长度+UTF-8 字节
//   索引区：帧数+1 个 u32 绝对偏移，末项为帧区结束（即文件长度）
//   帧区：每帧 f64 x,y,arm | u8 作用区数 + 每区 u8 标识引用 + f64 x,y,w,h |
//     u8 事件数 + 每事件 u8 标识引用 + u8 类型引用 + u16 源时刻 + f64 帧内偏移
const MAGIC = [0x53, 0x43, 0x45, 0x4c, 0x50, 0x4b, 0x30, 0x31]; // "SCELPK01"
export const PACK_HEADER_SIZE = 32;
const MAX_STRINGS = 255;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const upright = value => value === 0 ? 0 : value;

export function encodePack(sheet) {
  const strings = [];
  const refs = new Map();
  const intern = value => {
    let ref = refs.get(value);
    if (ref === undefined) {
      if (strings.length >= MAX_STRINGS) throw new Error('冻结包字符串表超出容量');
      ref = strings.length;
      strings.push(value);
      refs.set(value, ref);
    }
    return ref;
  };
  for (const frame of sheet.frames) {
    for (const box of frame.boxes) intern(box.id);
    for (const event of frame.events) { intern(event.id); intern(event.kind); }
  }
  const idBytes = encoder.encode(sheet.id);
  const stringBytes = strings.map(text => encoder.encode(text));
  if (idBytes.length > 255 || stringBytes.some(bytes => bytes.length > 255)) throw new Error('冻结包标识超出容量');
  const metaSize = 1 + idBytes.length + stringBytes.reduce((size, bytes) => size + 1 + bytes.length, 0);
  const indexOffset = PACK_HEADER_SIZE + metaSize;
  const framesOffset = indexOffset + (sheet.frames.length + 1) * 4;
  const recordSize = frame => 26 + frame.boxes.length * 33 + frame.events.length * 12;
  const total = framesOffset + sheet.frames.reduce((size, frame) => size + recordSize(frame), 0);
  const pack = new Uint8Array(total);
  const view = new DataView(pack.buffer);
  pack.set(MAGIC, 0);
  view.setUint32(8, sheet.frames.length, true);
  view.setUint32(12, sheet.fps, true);
  view.setUint32(16, sheet.duration, true);
  view.setUint8(20, sheet.facing === 'left' ? 1 : 0);
  view.setUint8(21, sheet.loop ? 1 : 0);
  view.setUint16(22, strings.length, true);
  view.setUint32(24, indexOffset, true);
  view.setUint32(28, framesOffset, true);
  let cursor = PACK_HEADER_SIZE;
  pack[cursor++] = idBytes.length;
  pack.set(idBytes, cursor); cursor += idBytes.length;
  for (const bytes of stringBytes) { pack[cursor++] = bytes.length; pack.set(bytes, cursor); cursor += bytes.length; }
  let slot = indexOffset, offset = framesOffset;
  for (const frame of sheet.frames) { view.setUint32(slot, offset, true); slot += 4; offset += recordSize(frame); }
  view.setUint32(slot, offset, true);
  offset = framesOffset;
  for (const frame of sheet.frames) {
    view.setFloat64(offset, upright(frame.pose.x), true);
    view.setFloat64(offset + 8, upright(frame.pose.y), true);
    view.setFloat64(offset + 16, upright(frame.pose.arm), true);
    let at = offset + 24;
    pack[at++] = frame.boxes.length;
    for (const box of frame.boxes) {
      pack[at++] = intern(box.id);
      view.setFloat64(at, upright(box.x), true);
      view.setFloat64(at + 8, upright(box.y), true);
      view.setFloat64(at + 16, upright(box.w), true);
      view.setFloat64(at + 24, upright(box.h), true);
      at += 32;
    }
    pack[at++] = frame.events.length;
    for (const event of frame.events) {
      if (!Number.isInteger(event.time) || event.time < 0 || event.time > 0xffff) throw new Error('冻结包事件时刻超出容量');
      pack[at++] = intern(event.id);
      pack[at++] = intern(event.kind);
      view.setUint16(at, event.time, true);
      view.setFloat64(at + 2, upright(event.offset), true);
      at += 10;
    }
    offset = at;
  }
  return pack;
}

export function parsePackHeader(bytes) {
  if (bytes.length < PACK_HEADER_SIZE) throw new Error('冻结包不足包头长度');
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) throw new Error('不是步格冻结包');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    frameCount: view.getUint32(8, true),
    fps: view.getUint32(12, true),
    duration: view.getUint32(16, true),
    facing: view.getUint8(20) ? 'left' : 'right',
    loop: Boolean(view.getUint8(21)),
    stringCount: view.getUint16(22, true),
    indexOffset: view.getUint32(24, true),
    framesOffset: view.getUint32(28, true),
  };
}

export function parsePackStrings(bytes, stringCount, offset = PACK_HEADER_SIZE) {
  let cursor = offset;
  const idLength = bytes[cursor++];
  const id = decoder.decode(bytes.subarray(cursor, cursor + idLength));
  cursor += idLength;
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const length = bytes[cursor++];
    strings.push(decoder.decode(bytes.subarray(cursor, cursor + length)));
    cursor += length;
  }
  if (Number.isNaN(idLength) || cursor > bytes.length) throw new Error('冻结包字符串区越界');
  return { id, strings };
}

export function decodePackFrame(header, strings, record, index) {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const pose = { x: view.getFloat64(0, true), y: view.getFloat64(8, true), arm: view.getFloat64(16, true) };
  let at = 24;
  const boxes = [];
  const boxCount = record[at++];
  for (let i = 0; i < boxCount; i++) {
    boxes.push({ id: strings[record[at++]],
      x: view.getFloat64(at, true), y: view.getFloat64(at + 8, true),
      w: view.getFloat64(at + 16, true), h: view.getFloat64(at + 24, true) });
    at += 32;
  }
  const events = [];
  const eventCount = record[at++];
  for (let i = 0; i < eventCount; i++) {
    events.push({ id: strings[record[at++]], kind: strings[record[at++]],
      time: view.getUint16(at, true), offset: view.getFloat64(at + 2, true) });
    at += 10;
  }
  return { index, time: index * 1000 / header.fps, pose, boxes, events };
}

export function decodePack(bytes) {
  const header = parsePackHeader(bytes);
  const { id, strings } = parsePackStrings(bytes, header.stringCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = [];
  for (let index = 0; index < header.frameCount; index++) {
    const start = view.getUint32(header.indexOffset + index * 4, true);
    const end = view.getUint32(header.indexOffset + index * 4 + 4, true);
    frames.push(decodePackFrame(header, strings, bytes.subarray(start, end), index));
  }
  return { id, fps: header.fps, duration: header.duration, facing: header.facing, loop: header.loop, frames };
}
