/**
 * 知识库只读访问（M2）。
 *
 * 只做两件事：读 24 个亚型的分型库；按当前亚型取登记的试验线索。
 * 不做的事：排序、评分、匹配度、入组判断、药物说明（D22 / AGENTS）。
 *
 * 知识库是构建物（`npm run kb:build`），这里永远以只读方式打开；打不开就如实报错，
 * 不降级成"没有试验"。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const KB_PATH = fileURLToPath(new URL('../knowledge/lymphoma-kb.sqlite', import.meta.url));

/** 亚型缩写 → 检索词。只用于"缩小范围"，不用于排序或打分。 */
const KEYWORDS = {
  'dlbcl-nos': ['DLBCL', 'diffuse large B', '弥漫大 B'],
  pmbcl: ['mediastinal', '纵隔'],
  hgbl: ['high-grade B', 'double-hit', '高级别 B'],
  fl: ['follicular', '滤泡'],
  mcl: ['mantle cell', '套细胞'],
  bl: ['Burkitt', '伯基特'],
  'malt-gastric': ['MALT', 'marginal zone', '边缘区'],
  'malt-nongastric': ['marginal zone', '边缘区'],
  nmzl: ['nodal marginal zone', '边缘区'],
  'lpl-wm': ['Waldenstr', 'lymphoplasmacytic', '巨球蛋白'],
  'cll-sll': ['CLL', 'chronic lymphocytic', '慢性淋巴细胞'],
  ptld: ['post-transplant', '移植后'],
  'b-lbl': ['lymphoblastic', '淋巴母细胞'],
  transformed: ['transformed', '转化'],
  'ptcl-nos': ['peripheral T-cell', '外周 T'],
  aitl: ['angioimmunoblastic', '血管免疫母细胞'],
  'alcl-alk-pos': ['anaplastic', '间变大细胞'],
  'alcl-alk-neg': ['anaplastic', '间变大细胞'],
  enktl: ['NK/T', 'nasal type', 'NK'],
  atll: ['adult T-cell', '成人 T'],
  hstcl: ['hepatosplenic', '肝脾'],
  't-lgl-tpll': ['T-cell large granular', 'prolymphocytic', '大颗粒'],
  chl: ['Hodgkin', '霍奇金'],
  nlphl: ['nodular lymphocyte predominant', '霍奇金'],
};

/** 缩写 → 亚型 id（用于按当前分型取线索）。取不到就返回空数组，不猜。 */
export function subtypeIdByCode(code, nameZh) {
  const key = String(code ?? '').toLowerCase().replace(/[, ].*$/, '').trim();
  const direct = {
    dlbcl: 'dlbcl-nos', pmbcl: 'pmbcl', hgbl: 'hgbl', fl: 'fl', mcl: 'mcl', bl: 'bl',
    ptld: 'ptld', enktl: 'enktl', atll: 'atll', hstcl: 'hstcl', chl: 'chl', nlphl: 'nlphl',
    aitl: 'aitl', nmzl: 'nmzl',
  };
  if (direct[key]) return direct[key];
  if (String(code ?? '').startsWith('MALT')) return String(nameZh ?? '').includes('胃') ? 'malt-gastric' : 'malt-nongastric';
  if (String(code ?? '').includes('LPL')) return 'lpl-wm';
  if (String(code ?? '').includes('CLL')) return 'cll-sll';
  if (String(code ?? '').includes('B-LBL')) return 'b-lbl';
  if (String(code ?? '').includes('PTCL')) return 'ptcl-nos';
  if (String(code ?? '').includes('ALCL')) return String(code).includes('+') ? 'alcl-alk-pos' : 'alcl-alk-neg';
  if (String(code ?? '').includes('LGL')) return 't-lgl-tpll';
  return null;
}

export function openKb(path = KB_PATH) {
  if (!existsSync(path)) {
    throw new Error(`知识库不存在：${path}（先跑 npm run kb:build）`);
  }
  const db = new DatabaseSync(path, { readOnly: true });
  return {
    db,
    close: () => db.close(),

    /** 分型库：[谱系, 缩写, 中文名, 恶性程度, 常见就诊科室]，按 B → T/NK → 霍奇金 与排列顺序 */
    library() {
      return db.prepare(
        `SELECT lineage, code, name_zh, grade_text, dept_text FROM subtype
         ORDER BY CASE lineage WHEN 'B' THEN 1 WHEN 'T' THEN 2 ELSE 3 END, ordinal, code`,
      ).all().map((r) => [r.lineage, r.code, r.name_zh, r.grade_text ?? '', r.dept_text ?? '']);
    },

    subtype(id) {
      return db.prepare('SELECT * FROM subtype WHERE id = ?').get(id) ?? null;
    },

    /** 试验线索。不排序、不评分：只按登记号字典序取前 limit 条，保证同一亚型每次结果一致。 */
    trialsBySubtype(subtypeId, { limit = 3 } = {}) {
      const words = KEYWORDS[subtypeId] ?? [];
      if (!words.length) return [];
      const where = words.map(() => '(title LIKE ? OR conditions LIKE ? OR brief_title LIKE ?)').join(' OR ');
      const params = [];
      for (const w of words) {
        const like = `%${w}%`;
        params.push(like, like, like);
      }
      const rows = db.prepare(
        `SELECT id, registry_no, primary_registry, title, phase, status_cn, status,
                interventions, is_china, site_count, url, year_basis, source_id
         FROM trial WHERE ${where}
         ORDER BY COALESCE(registry_no, id) LIMIT ?`,
      ).all(...params, limit);
      return rows.map(toLead);
    },

    /** 按库内 id 取单条线索；没有就返回 null（不猜、不补）。 */
    trialById(id) {
      const r = db.prepare(
        `SELECT id, registry_no, primary_registry, title, phase, status_cn, status,
                interventions, is_china, site_count, url, year_basis, source_id
         FROM trial WHERE id = ?`,
      ).get(id);
      return r ? toLead(r) : null;
    },

    /**
     * 按亚型取流程：通用流程（subtype_id 为空）在前，该亚型专属在后。
     * 只读出来展示，不排序、不打分、不挑"该走哪条"——那是治疗团队的判断。
     * verified = 0 表示还没逐条跟指南原文核对过，界面必须照实标。
     */
    flows(subtypeId, { stepLimit = 12 } = {}) {
      const rows = db.prepare(
        `SELECT id, subtype_id, title, intent, scope, source_id, verified, note
         FROM flow WHERE subtype_id IS NULL OR subtype_id = ?
         ORDER BY (subtype_id IS NULL) DESC, id`,
      ).all(subtypeId ?? null);
      const stepStmt = db.prepare(
        `SELECT seq, phase, kind, title, detail, branch, evidence, locator, source_id
         FROM step WHERE flow_id = ? ORDER BY seq LIMIT ?`,
      );
      const srcStmt = db.prepare('SELECT id, title, tier, url FROM source WHERE id = ?');
      return rows.map((f) => {
        const src = srcStmt.get(f.source_id) ?? null;
        return {
          id: f.id,
          title: f.title,
          intent: f.intent ?? '',
          scope: f.scope ?? '',
          note: f.note ?? '',
          isGeneral: f.subtype_id === null,
          verified: f.verified === 1,
          source: src ? { id: src.id, title: src.title, tier: src.tier ?? '', url: src.url ?? null } : null,
          steps: stepStmt.all(f.id, stepLimit).map((s) => ({
            seq: s.seq, phase: s.phase ?? '', kind: s.kind ?? '', title: s.title,
            detail: s.detail ?? '', branch: s.branch ?? null,
            evidence: s.evidence ?? null, locator: s.locator ?? null,
            source: (srcStmt.get(s.source_id) ?? null)?.title ?? null,
          })),
        };
      });
    },

    /** 库规模，只用于设置面板显示。 */
    stats() {
      return {
        subtypes: db.prepare('SELECT COUNT(*) AS n FROM subtype').get().n,
        trials: db.prepare('SELECT COUNT(*) AS n FROM trial').get().n,
      };
    },
  };
}

/** 库行 → 界面线索。药名照抄 interventions，不补机制与阶段以外的信息（D22）。 */
function toLead(r) {
  let drugs = [];
  try {
    drugs = JSON.parse(r.interventions ?? '[]');
  } catch {
    drugs = [];
  }
  const no = r.registry_no || r.id;
  return {
    id: r.id,
    nct: `${r.primary_registry || '登记'} ${no}`.trim(),
    title: r.title,
    phase: r.phase || '未标注',
    drug: drugs.length ? String(drugs[0]) : '未标注',
    status: r.status_cn || r.status || '状态见登记原文',
    site: r.is_china ? (r.site_count ? `境内 ${r.site_count} 家中心` : '中国境内中心') : '境外中心',
    fit: '入组条件见登记原文',
    yearBasis: r.year_basis || 'unknown',
    url: r.url ?? null,
  };
}
