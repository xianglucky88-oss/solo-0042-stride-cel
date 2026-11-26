import { compile } from './compile.mjs';
export { metadata } from './config.mjs';
export { normalize } from './document.mjs';
export { demo } from './demo.mjs';
export { buildSuite } from './suite.mjs';

export function render(document) {
  const sheet = compile(document);
  const bytes = Buffer.from(JSON.stringify({ format:'stride-cel/1', ...sheet }, null, 2)+'\n');
  return { bytes, summary:{ id:sheet.id, frames:sheet.frames.length, events:document.events.length,
    active:sheet.frames.filter(frame => frame.boxes.length).length, continuity:sheet.continuity, unsampled:sheet.unsampled } };
}
