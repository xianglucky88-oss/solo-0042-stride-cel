import { normalize } from './document.mjs';
import { render } from './index.mjs';
import { list, object, requireThat, key } from '../server/input.mjs';
import { InputError } from '../server/input.mjs';

const FACINGS = ['left', 'right'];

// A suite is the same draft frozen at two legal frame rates and both facings.
// Every variant is produced through the exact normalize/render path used for a
// standalone freeze, so its bytes equal a single-document freeze of the same
// source, frame rate and facing.
export function buildSuite(input) {
  object(input, '成套请求');
  object(input.document, '工作文档');
  const rates = list(input.rates, 2, 2, '成套帧率').map((value, i) => {
    const fps = Number(value);
    requireThat(Number.isInteger(fps) && fps >= 6 && fps <= 60, `第 ${i + 1} 档帧率需要 6–60 的整数`);
    return fps;
  }).sort((a, b) => a - b);
  requireThat(rates[0] !== rates[1], '两档帧率必须不同');
  const required = [...new Set(list(input.require ?? [], 0, 24, '必需作用区').map(value => key(value, '必需作用区')))]
    .sort((a, b) => a.localeCompare(b));

  // Normalize the draft once so window ids and all other constraints are
  // validated before any variant is rendered.
  const draft = normalize(input.document);
  const knownWindows = new Set(draft.windows.map(window => window.id));
  const unknown = required.filter(id => !knownWindows.has(id));
  if (unknown.length) throw new InputError(`草稿没有这些作用区：${unknown.join('、')}`);

  const variants = [];
  for (const fps of rates) {
    for (const facing of FACINGS) {
      const document = { ...draft, fps, facing };
      const rendered = render(document);
      variants.push({ fps, facing, document, rendered });
    }
  }

  if (required.length) {
    const missing = variants
      .filter(variant => required.some(id => variant.rendered.summary.unsampled.includes(id)))
      .map(variant => ({
        fps: variant.fps,
        facing: variant.facing,
        windows: required.filter(id => variant.rendered.summary.unsampled.includes(id)),
      }));
    if (missing.length) {
      throw new InputError('必需作用区未在每份成品出现，成套冻结未签发', 422, { missing });
    }
  }

  return {
    draft,
    rates,
    required,
    variants: variants.map(({ fps, facing, document, rendered }) => ({
      fps, facing, document, summary: rendered.summary, base64: rendered.bytes.toString('base64'),
    })),
  };
}
