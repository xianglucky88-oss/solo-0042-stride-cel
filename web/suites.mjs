import { get, post } from './api.mjs';
import { $, el } from './dom.mjs';

export function mountSuitePanel(container, { current, onFreeze }) {
  container.replaceChildren();

  const rateA = el('input');
  rateA.type = 'number'; rateA.min = 6; rateA.max = 60; rateA.step = 1; rateA.value = 30;
  const rateB = el('input');
  rateB.type = 'number'; rateB.min = 6; rateB.max = 60; rateB.step = 1; rateB.value = 12;
  const required = el('input');
  required.type = 'text'; required.placeholder = '逗号分隔，如 sweep、heel';
  const button = el('button', '冻结两档 × 两朝向', 'accent');
  button.type = 'button';

  const rateRow = (label, input) => {
    const row = el('div', undefined, 'field');
    const tag = el('label', label);
    tag.htmlFor = input.id;
    row.append(tag, input);
    return row;
  };
  rateA.id = 'suite-rate-a';
  rateB.id = 'suite-rate-b';
  required.id = 'suite-require';
  const requireRow = el('div', undefined, 'field');
  const requireLabel = el('label', '必需作用区');
  requireLabel.htmlFor = required.id;
  requireRow.append(requireLabel, required);

  button.classList.add('suite-submit');
  button.onclick = () => {
    const rates = [Number(rateA.value), Number(rateB.value)];
    const list = required.value.split(/[，,]/).map(id => id.trim()).filter(Boolean);
    onFreeze({ document: current(), rates, require: list });
  };

  container.append(rateRow('高档帧率', rateA), rateRow('低档帧率', rateB), requireRow, button);
}

export async function refreshSuites(container) {
  const suites = await get('/api/suites');
  if (!suites.length) {
    container.replaceChildren(el('p', '暂无成套冻结', 'note'));
    return;
  }
  container.replaceChildren(...suites.map(({ id, time }) => {
    const button = el('button', undefined, 'version');
    button.type = 'button';
    button.title = id;
    button.append(
      el('span', `套 ${id.slice(0, 12)}`, 'mono'),
      el('time', new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })),
    );
    button.addEventListener('click', () => openSuite(id));
    return button;
  }));
}

async function openSuite(id) {
  const record = await get(`/api/suites/${id}`);
  const box = el('div', undefined, 'suite-detail');
  box.append(el('h4', `套件 ${id.slice(0, 12)}`, 'mono'));
  box.append(el('p', `帧率 ${record.rates.join(' / ')} fps · 每份可单独下载`, 'muted'));
  for (const variant of record.variants) {
    const row = el('div', undefined, 'suite-row');
    row.append(el('span', `${variant.fps} fps · ${variant.facing === 'left' ? '向左' : '向右'} · ${variant.summary.frames} 帧`));
    const link = el('a', '下载');
    link.href = `/api/suites/${id}/${variant.fps}-${variant.facing}/asset`;
    link.download = '';
    row.append(link);
    box.append(row);
  }
  const host = $('suite-detail');
  host.replaceChildren(box);
}
