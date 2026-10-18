/**
 * 就诊准备导出（A23 / A24）。
 *
 * 模板只有这一份，界面预览和落盘都走它，避免两处各写一份导致漂移。
 *
 * 硬约束：
 * - 两区顺序固定：先「想问的事」，再「我的看法与担心」。
 * - 看法区首行必须是声明「不是医生结论」。
 * - 只导出选入项；没选的不进文件。
 * - 关键记录只抄库里的值，缺了就写「未记录」，不补、不推算。
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { validateWorkspacePath } from './paths.js';

const VIEW_DECLARATION = '> 以下是我的看法与担心，**不是医生结论**。';

/**
 * 生成 Markdown。
 * @param {object} args
 * @param {object} args.profile   { name, ... }
 * @param {Array}  args.facts     选入的「想问的事」：[{ text, source }]
 * @param {Array}  args.views     选入的「我的看法」：[{ text, recordedOn }]
 * @param {Array}  args.keyRecords 关键记录：[{ label, value }]
 * @param {string} args.nextVisit 下次复诊日期，没有就传 null
 * @param {string} args.today     今天
 */
export function buildPrepMarkdown({
  profile,
  facts = [],
  views = [],
  keyRecords = [],
  nextVisit = null,
  today,
}) {
  const title = nextVisit ? `# 就诊准备 · ${nextVisit}` : '# 就诊准备';
  const lines = [title, ''];

  lines.push(`- 整理人：${profile?.name ?? '未记录'}`, `- 导出日期：${today}`, '');

  lines.push('一、想问的事', '');
  if (!facts.length) {
    lines.push('（没有选入的问题）');
  } else {
    facts.forEach((q, i) => {
      lines.push(`${i + 1}. ${q.text}`);
      if (q.source) lines.push(`   - 来源：${q.source}`);
    });
  }

  lines.push('', '二、我的看法与担心', '', VIEW_DECLARATION, '');
  if (!views.length) {
    lines.push('（没有选入的看法）');
  } else {
    for (const v of views) {
      lines.push(`- ${v.text}`);
      lines.push(`  - 记录于 ${v.recordedOn ?? '未记录'}；这是一条看法，不是医生结论`);
    }
  }

  lines.push('', '三、附：关键记录', '');
  if (!keyRecords.length) {
    lines.push('（暂无关键记录）');
  } else {
    for (const r of keyRecords) lines.push(`- ${r.label}：${r.value}`);
  }

  lines.push(
    '',
    '四、口径说明',
    '',
    '- 以上内容由本人整理，未经医生确认。',
    '- 工作台只整理资料，不提供诊断、治疗或用药建议。',
    '- 导出只含本次勾选的条目；未勾选的内容不在文件里。',
  );

  return `${lines.join('\n')}\n`;
}

/** 导出文件名：只用 ASCII，避免不同下载器对中文名的处理不一致。中文标题放在文件内容里。 */
export function exportFilename(today, stamp = nowStamp()) {
  const safe = String(today ?? '').replace(/[^0-9-]/g, '');
  return `prep-${safe || 'nodate'}-${stamp}.md`;
}

function nowStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 落盘到资料目录下的 exports/。
 * 目录不存在才创建；目标路径必须在资料目录之内，越界直接抛错。
 * @returns {{ path: string, filename: string, bytes: number }}
 */
export function writeExport({ root, filename, text }) {
  const { path: rootPath } = validateWorkspacePath(root);
  const dir = join(rootPath, 'exports');
  mkdirSync(dir, { recursive: true });

  const target = resolve(dir, filename);
  if (target !== dir && !target.startsWith(dir + sep)) {
    throw new Error('导出路径越界');
  }
  writeFileSync(target, text, 'utf8');
  return { path: target, filename, bytes: statSync(target).size };
}
