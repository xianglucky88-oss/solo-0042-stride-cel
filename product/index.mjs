import { compile } from './compile.mjs';
export { metadata } from './config.mjs';
export { normalize } from './document.mjs';
export { demo, demoArm } from './demo.mjs';

export function render(document) {
  const sheet = compile(document);
  const bytes = Buffer.from(JSON.stringify({ format:'stride-cel/1', ...sheet }, null, 2)+'\n');
  const summary = { id:sheet.id, frames:sheet.frames.length, events:(document.events ?? []).length,
    active:sheet.frames.filter(frame => frame.boxes.length).length, continuity:sheet.continuity, unsampled:sheet.unsampled };
  if (document.arm) {
    summary.arm = {
      grip: document.arm.grip,
      handoff: document.arm.handoff ? { ...document.arm.handoff } : null,
      bracket: document.arm.bracket ? { ...document.arm.bracket } : null,
    };
    summary.handoff = summary.arm.handoff;
  }
  return { bytes, summary };
}
