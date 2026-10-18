'use strict';
/* 小铃铛 LymBell v0.1.0 — 交互原型。所有数据为模拟；不读写真实文件、不调用模型或宿主 API。 */

/* 版本号的唯一来源是仓库根目录的 VERSION 文件；这里必须与它逐字一致。
   改动任一处都要同时改另一处，并用 `node scripts/check-version.mjs` 校验。 */
const APP_INFO = {
  version: '0.1.0',
  build: '2026-10-17',
  channel: 'prototype',
  channelLabel: '交互原型 · 未接入 DSH'
};
APP_INFO.displayVersion = `v${APP_INFO.version}`;

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let uidSeq = 0;
const uid = (p) => p + (++uidSeq);

/* ---------------- icons & nav ---------------- */
const icons = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  badge: 'M12 3l7 4v10l-7 4-7-4V7ZM9 12l2 2 4-4',
  drip: 'M12 3v6m0 0a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM7 7h10',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  chart: 'M4 3v17h17M7 14l4-5 4 3 5-7',
  shield: 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6ZM9 12l2 2 4-4',
  calendar: 'M4 5h16v16H4ZM8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2',
  flask: 'M9 3h6v5l5 9a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l5-9Z',
  heart: 'M12 20.3c-4.6-2.9-7.4-5.6-7.4-9A4.1 4.1 0 0 1 12 8.4a4.1 4.1 0 0 1 7.4 2.9c0 3.4-2.8 6.1-7.4 9Z',
  leaf: 'M20 4c-9.4 0-15 4.1-15 9.6A5.4 5.4 0 0 0 10.4 19C16 19 20 13.4 20 4ZM5.5 18.6C8 13.4 12 10.6 17 9.6'
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k]}"/></svg>`;

const PAGES = [
  ['dashboard', '看板', 'home'], ['diagnosis', '我的分型', 'badge'], ['treatment', '治疗历程', 'drip'],
  ['labs', '检查与指标', 'lab'], ['timeline', '病情一图秀', 'chart'], ['nutrition', '营养支持', 'leaf'],
  ['mind', '心理支持', 'heart'], ['care', '照护与症状', 'shield'], ['review', '复诊准备', 'calendar'],
  ['trials', '临床试验', 'flask']
];
const SUBPAGES = {
  diagnosis: ['分型档案', '病理与分子', '分期与病灶', '会诊与二次意见', '分型库'],
  treatment: ['当前方案', '周期与用药', '疗效评估'],
  labs: ['血象', '生化与免疫', '感染监测', '影像与 PET'],
  nutrition: ['进食与体重', '当下困扰'],
  mind: ['当下感受', '生育与家庭'],
  care: ['感染与发热', '症状与日常', '血象与支持治疗'],
  review: ['复诊节奏', '就诊准备', '观察等待'],
  trials: ['线索', '已收藏', '入组问题']
};
const SUBTITLES = {
  dashboard: '分型、治疗和每一次复查放在一起，让下一次讨论有据可查。',
  diagnosis: '分型是所有决定的起点；这里保存依据，不替你解释病理。',
  treatment: '方案、周期与疗效各归其位，改过的计划也留痕。',
  labs: '同一个指标按时间排好，换医院、换方法都标出来。',
  timeline: '治疗、检验与症状放回同一段时间里，看见变化发生在哪一步。',
  nutrition: '吃得下、吃得够、体重稳，是治疗期间最实际的一件事；不需要计算每一口。',
  mind: '害怕、疲惫、不想说话都算正常反应；这里的内容默认只属于你。',
  care: '治疗之外的身体感受与操作，也可以放进病程；工作台只记录发生过什么。',
  review: '该带什么、该问什么，提前写下来，诊室里就不用凭记忆。',
  trials: '线索不是推荐；先弄清入组条件，再决定要不要问。'
};

/* ---------------- 模拟数据 ---------------- */
const CATS = [
  ['肿瘤负荷', '#7c5cbf'], ['血象', '#a03d5c'], ['免疫与感染', '#2f6f66'],
  ['生化', '#9a6410'], ['治疗毒性', '#c2551f'], ['功能与体重', '#4a6fa5']
];
const METRICS = {
  ldh: { name: 'LDH', unit: 'U/L', cat: '肿瘤负荷', color: '#7c5cbf', dec: 0, note: '同一实验室方法可比；升高不特指复发', points: [
    { d: '2026-02-10', v: 380, src: '初诊生化' }, { d: '2026-02-18', v: 520, src: '确诊前复查' },
    { d: '2026-03-02', v: 410, src: '第 1 周期前' }, { d: '2026-04-13', v: 260, src: '第 3 周期前' },
    { d: '2026-05-18', v: 230, src: '中期评估' }, { d: '2026-07-20', v: 195, src: '结束评估' },
    { d: '2026-10-09', v: 202, src: '随访复查' }] },
  lesion: { name: '最大病灶长径', unit: 'mm', cat: '肿瘤负荷', color: '#a48ad6', dec: 0, note: '同一部位、同一测量方式才可比', points: [
    { d: '2026-02-20', v: 68, src: '基线 PET-CT' }, { d: '2026-05-18', v: 22, src: '中期 PET-CT' },
    { d: '2026-07-20', v: 9, src: '结束 PET-CT' }, { d: '2026-10-09', v: 8, src: '随访 CT' }] },
  anc: { name: '中性粒细胞', unit: '10⁹/L', cat: '血象', color: '#a03d5c', dec: 1, note: '不同医院参考区间不合并', points: [
    { d: '2026-02-18', v: 4.2, src: '治疗前血常规' }, { d: '2026-03-12', v: 1.1, src: '第 1 周期后' },
    { d: '2026-04-02', v: 3.6, src: '第 2 周期前' }, { d: '2026-04-25', v: 0.8, src: '第 3 周期后' },
    { d: '2026-05-18', v: 3.1, src: '中期评估' }, { d: '2026-06-05', v: 1.0, src: '第 5 周期后' },
    { d: '2026-07-20', v: 3.8, src: '结束评估' }, { d: '2026-10-09', v: 4.4, src: '随访复查' }] },
  hgb: { name: '血红蛋白', unit: 'g/L', cat: '血象', color: '#c2687f', dec: 0, note: '输注后需标注', points: [
    { d: '2026-02-18', v: 132, src: '治疗前血常规' }, { d: '2026-04-25', v: 98, src: '第 3 周期后' },
    { d: '2026-07-20', v: 126, src: '结束评估' }, { d: '2026-10-09', v: 131, src: '随访复查' }] },
  plt: { name: '血小板', unit: '10⁹/L', cat: '血象', color: '#c98a9c', dec: 0, note: '不同检测方法不合并', points: [
    { d: '2026-02-18', v: 210, src: '治疗前血常规' }, { d: '2026-04-25', v: 88, src: '第 3 周期后' },
    { d: '2026-07-20', v: 198, src: '结束评估' }, { d: '2026-10-09', v: 212, src: '随访复查' }] },
  igg: { name: 'IgG', unit: 'g/L', cat: '免疫与感染', color: '#2f6f66', dec: 1, note: '利妥昔单抗后可能持续偏低', points: [
    { d: '2026-02-18', v: 9.2, src: '治疗前免疫球蛋白' }, { d: '2026-05-18', v: 6.2, src: '中期评估' },
    { d: '2026-07-20', v: 5.8, src: '结束评估' }, { d: '2026-10-09', v: 6.4, src: '随访复查' }] },
  uric: { name: '尿酸', unit: 'μmol/L', cat: '生化', color: '#9a6410', dec: 0, note: '肿瘤溶解风险期需关注', points: [
    { d: '2026-02-18', v: 468, src: '治疗前生化' }, { d: '2026-03-05', v: 382, src: '第 1 周期中' },
    { d: '2026-07-20', v: 356, src: '结束评估' }] },
  crp: { name: 'CRP', unit: 'mg/L', cat: '生化', color: '#b07c2a', dec: 0, note: '感染与肿瘤均可升高', points: [
    { d: '2026-02-18', v: 28, src: '治疗前' }, { d: '2026-04-27', v: 46, src: '发热住院期间' },
    { d: '2026-07-20', v: 4, src: '结束评估' }, { d: '2026-10-09', v: 3, src: '随访复查' }] },
  wt: { name: '体重', unit: 'kg', cat: '功能与体重', color: '#4a6fa5', dec: 1, note: '单点不连线', points: [
    { d: '2026-02-18', v: 72.0, src: '治疗前' }, { d: '2026-04-25', v: 69.2, src: '第 3 周期后' },
    { d: '2026-07-20', v: 70.1, src: '结束评估' }, { d: '2026-10-09', v: 71.3, src: '随访复查' }] }
};
const TREATMENTS = [
  { id: 'c1', kind: 'chemo', label: '1', long: '第 1 周期', from: '2026-03-02', to: '2026-03-07', color: '#7c5cbf', actual: true },
  { id: 'c2', kind: 'chemo', label: '2', long: '第 2 周期', from: '2026-03-23', to: '2026-03-28', color: '#7c5cbf', actual: true },
  { id: 'c3', kind: 'chemo', label: '3', long: '第 3 周期', from: '2026-04-13', to: '2026-04-18', color: '#7c5cbf', actual: true },
  { id: 'c4', kind: 'chemo', label: '4', long: '第 4 周期', from: '2026-05-04', to: '2026-05-09', color: '#7c5cbf', actual: true },
  { id: 'c5', kind: 'chemo', label: '5', long: '第 5 周期', from: '2026-05-25', to: '2026-05-30', color: '#7c5cbf', actual: true },
  { id: 'c6', kind: 'chemo', label: '6', long: '第 6 周期', from: '2026-06-15', to: '2026-06-20', color: '#7c5cbf', actual: true },
  { id: 'pet1', kind: 'mark', label: '中期 PET', long: 'Deauville 3', from: '2026-05-18', to: '2026-05-18', color: '#c2551f', actual: true },
  { id: 'pet2', kind: 'surgery', label: '结束 PET', long: 'Deauville 2', from: '2026-07-20', to: '2026-07-20', color: '#2f6f66', actual: true }
];
const DATA_END = '2026-10-17';
const DATA_START = '2026-02-01';

const PROFILES = [
  { id: 'p1', name: '周先生', initial: '周', age: 38, subtype: 'DLBCL NOS', stage: 'Lugano IIA', plan: 'R-CHOP ×6 已完成', phase: '结束治疗 · 随访中', tag: 'DEMO-1 侵袭性 B 细胞 · 全程', full: true, ww: false, root: '/Users/zhou/Documents/LymBell' },
  { id: 'p2', name: '陈女士', initial: '陈', age: 52, subtype: '滤泡性淋巴瘤 3A', stage: 'Lugano IIIA', plan: '观察等待', phase: '观察等待 · 每 3 月随访', tag: 'DEMO-2 惰性 · 观察等待', full: false, ww: true, root: '/Users/chen/Documents/LymBell' },
  { id: 'p3', name: '李同学', initial: '李', age: 19, subtype: '经典霍奇金 · 结节硬化型', stage: 'Lugano IIB', plan: 'ABVD ×4 进行中', phase: '第 3 周期后', tag: 'DEMO-3 霍奇金 · 青少年', full: false, ww: false, root: '' },
  { id: 'p4', name: '吴先生', initial: '吴', age: 64, subtype: '套细胞淋巴瘤 · 经典型', stage: 'Lugano IV', plan: 'BTK 抑制剂维持', phase: '维持治疗 · 第 8 月', tag: 'DEMO-4 套细胞 · 长期用药', full: false, ww: false, root: '/Users/wu/Documents/LymBell' },
  { id: 'p5', name: '赵女士', initial: '赵', age: 45, subtype: '外周 T 细胞淋巴瘤 NOS', stage: 'Lugano III', plan: '二线后评估', phase: '复发难治 · 寻找线索', tag: 'DEMO-5 T 细胞 · 复发难治', full: false, ww: false, root: '/Users/zhao/Documents/LymBell' }
];

const SUBTYPE_TREE = [
  { lv: 1, name: '非霍奇金淋巴瘤 (NHL)' },
  { lv: 2, name: '成熟 B 细胞肿瘤' },
  { lv: 3, name: '弥漫大 B 细胞淋巴瘤 (DLBCL)' },
  { lv: 4, name: 'DLBCL NOS', on: true }
];

const IHC = [
  ['CD20', '阳性（弥漫）', 'B 细胞来源'],
  ['CD3', '阴性', 'T 细胞标记'],
  ['CD10', '阴性', '生发中心标记'],
  ['MUM1', '阳性（约 70%）', '非生发中心表型'],
  ['BCL2', '阳性（约 80%）', ''],
  ['BCL6', '阳性（约 60%）', ''],
  ['Ki-67', '约 80%', '增殖指数'],
  ['EBER', '阴性', 'EBV 相关'],
  ['PD-L1', '未检测', '本报告未做']
];
const FISH = [
  ['MYC 重排', '阴性', '排除 MYC 单独重排'],
  ['BCL2 重排', '阴性', ''],
  ['BCL6 重排', '阴性', '三阴性 → 不支持双打击/三打击']
];
const LESIONS = [
  { site: '右颈 II 区淋巴结', size: '3.4 cm', suv: '18.2', src: '基线 PET-CT' },
  { site: '纵隔 4R 淋巴结', size: '6.8 cm', suv: '22.6', src: '基线 PET-CT' },
  { site: '右肺门淋巴结', size: '1.9 cm', suv: '9.4', src: '基线 PET-CT' }
];
const CYCLES = [
  { n: 1, plan: '03-02', real: '03-02', delay: '—', adjust: '足量', note: '—' },
  { n: 2, plan: '03-23', real: '03-23', delay: '—', adjust: '足量', note: '—' },
  { n: 3, plan: '04-13', real: '04-20', delay: '+7 天', adjust: '足量', note: '第 2 周期后发热性中性粒细胞减少，待血象恢复' },
  { n: 4, plan: '05-04', real: '05-04', delay: '—', adjust: '长春新碱减量 25%', note: '手指麻木 1 级' },
  { n: 5, plan: '05-25', real: '05-25', delay: '—', adjust: '足量', note: '—' },
  { n: 6, plan: '06-15', real: '06-15', delay: '—', adjust: '足量', note: '末次给药' }
];
const PETS = [
  { d: '2026-02-20', when: '基线', dv: 5, size: '6.8 cm', result: '多发高代谢淋巴结', src: 'PET-CT 报告 · 第 1 页' },
  { d: '2026-05-18', when: '中期（第 4 周期后）', dv: 3, size: '2.2 cm', result: '代谢明显减低，高于纵隔、低于肝血池', src: 'PET-CT 报告 · 第 1 页' },
  { d: '2026-07-20', when: '结束治疗', dv: 2, size: '0.9 cm', result: '代谢低于纵隔，考虑完全代谢缓解', src: 'PET-CT 报告 · 结论页' }
];
const AEs = [
  { d: '2026-04-26', name: '发热性中性粒细胞减少', grade: 3, note: 'ANC 0.8 + 体温 38.6℃，住院 3 天；医生已处理', src: '住院记录' },
  { d: '2026-05-10', name: '手指麻木', grade: 1, note: '长春新碱相关，第 4 周期减量后未加重', src: '本人记录 · 门诊确认' },
  { d: '2026-05-12', name: '口腔黏膜炎', grade: 2, note: '进食受影响，5 天后缓解', src: '本人记录' },
  { d: '2026-06-18', name: '乏力', grade: 2, note: '爬两层楼需休息', src: '本人记录' }
];
const TRIALS = [
  { id: 't1', nct: '示例登记号 A', title: '复发/难治 DLBCL：CD20×CD3 双抗联合方案', phase: 'II 期', drug: '格菲妥单抗', status: '招募中', site: '本市 2 家中心', fit: '需 ≥2 线既往治疗' },
  { id: 't2', nct: '示例登记号 B', title: '复发/难治 B 细胞淋巴瘤：CD19 CAR-T', phase: 'I/II 期', drug: '阿基仑赛', status: '招募中', site: '外省 1 家中心', fit: '需评估脏器功能与既往治疗线' },
  { id: 't3', nct: '示例登记号 C', title: '套细胞淋巴瘤：BTK 抑制剂一线联合', phase: 'III 期', drug: '泽布替尼', status: '未开始招募', site: '多中心', fit: '初治、不适合强化疗' }
];

/* 分型库：首批覆盖 = NCCN 2025 有独立诊疗路径的亚型，共 24 项（B 细胞 14 / T-NK 8 / 霍奇金 2） */
const SUBTYPES = [
  ['B', 'DLBCL, NOS', '弥漫大 B 细胞淋巴瘤，非特指型', '高', '血液科/肿瘤内科'],
  ['B', 'PMBCL', '原发性纵隔大 B 细胞淋巴瘤', '高', '血液科'],
  ['B', 'HGBL', '高级别 B 细胞淋巴瘤（含双打击/三打击）', '高', '血液科'],
  ['B', 'FL', '滤泡性淋巴瘤（1–2 / 3A / 3B）', '低—高', '血液科'],
  ['B', 'MCL', '套细胞淋巴瘤（经典型 / 惰性型）', '中/高', '血液科/肿瘤内科'],
  ['B', 'BL', '伯基特淋巴瘤', '高', '血液科/肿瘤内科'],
  ['B', 'MALT（胃）', '胃结外边缘区淋巴瘤', '低', '血液科/消化科'],
  ['B', 'MALT（非胃）', '非胃、非皮肤结外边缘区淋巴瘤', '低', '血液科/对应器官专科'],
  ['B', 'NMZL', '淋巴结边缘区淋巴瘤', '低', '血液科/肿瘤内科'],
  ['B', 'LPL/WM', '淋巴浆细胞淋巴瘤 / 华氏巨球蛋白血症', '低', '血液科'],
  ['B', 'CLL/SLL', '慢性淋巴细胞白血病 / 小淋巴细胞淋巴瘤', '低', '血液科'],
  ['B', 'PTLD', '移植后淋巴增殖性疾病', '中—高', '血液科'],
  ['B', 'B-LBL', 'B 淋巴母细胞白血病/淋巴瘤', '高', '儿科血液科/肿瘤科'],
  ['B', '转化型', '惰性淋巴瘤向 DLBCL 的组织学转化', '高', '血液科'],
  ['T', 'PTCL-NOS', '外周 T 细胞淋巴瘤，非特指型', '中—高', '血液科/肿瘤内科'],
  ['T', 'AITL', '血管免疫母细胞性 T 细胞淋巴瘤', '中—高', '血液科/肿瘤内科'],
  ['T', 'ALCL（ALK+）', '间变性大细胞淋巴瘤，ALK 阳性', '中', '血液科/肿瘤内科'],
  ['T', 'ALCL（ALK−）', '间变性大细胞淋巴瘤，ALK 阴性', '高', '血液科/肿瘤内科'],
  ['T', 'ENKTL', '结外 NK/T 细胞淋巴瘤（鼻型）', '高', '血液科/耳鼻喉科'],
  ['T', 'ATLL', '成人 T 细胞白血病/淋巴瘤', '高', '血液科/感染科'],
  ['T', 'HSTCL', '肝脾 T 细胞淋巴瘤', '高', '血液科/肿瘤内科'],
  ['T', 'T-LGL / T-PLL', 'T 细胞大颗粒淋巴细胞白血病 / 幼淋巴细胞白血病', '低—高', '血液科'],
  ['H', 'cHL', '经典型霍奇金淋巴瘤（4 个亚型）', '低—高', '血液科/胸内科'],
  ['H', 'NLPHL', '结节性淋巴细胞为主型霍奇金淋巴瘤', '低', '血液科']
];
const LINEAGE_LABEL = { B: 'B 细胞', T: 'T / NK 细胞', H: '霍奇金' };

const state = {
  page: 'dashboard', sub: {}, profileId: 'p1',
  session: null,
  cfg: {
    root: '/Users/zhou/Documents/LymBell', size: { doc: 8.6, derived: 2.4, db: 1.1 },
    backupAt: '2026-10-16 22:10', consent: true, tokenMasked: 'sk-····7fQ2', tokenSrc: '本机填写',
    dbStatus: '未接入', dbChecked: '—'
  },
  range: 'all', zoom: 100, sel: ['ldh', 'anc', 'lesion'], line: 1, libLine: 'all',
  toggles: { treatment: true, keypoints: true, changes: false },
  pin: null, flipped: new Set(), query: '', toastTimer: null,
  showAllQuestions: false,
  docs: [
    { id: 'd1', name: '病理报告 · 纵隔淋巴结', date: '2026-02-18', type: '病理', status: '已核对' },
    { id: 'd2', name: 'PET-CT · 基线', date: '2026-02-20', type: '影像', status: '已核对' },
    { id: 'd3', name: 'R-CHOP 化疗记录', date: '2026-06-20', type: '治疗', status: '待核对' },
    { id: 'd4', name: 'PET-CT · 结束评估', date: '2026-07-20', type: '影像', status: '已核对' },
    { id: 'd5', name: '血常规 · 随访', date: '2026-10-09', type: '检验', status: '已核对' }
  ],
  candidates: [
    { id: 'c1', name: '末次化疗日期', value: '2026-06-15', source: '化疗记录 · 第 1 页', status: 'candidate' },
    { id: 'c2', name: '第 4 周期长春新碱剂量', value: '原文写"减量 25%"，未写绝对剂量', source: '化疗记录 · 第 3 页', status: 'needs_review' },
    { id: 'c3', name: '骨髓活检结论', value: '「未见淋巴瘤累及」，流式未见异常', source: '骨髓报告 · 2026-02-19', status: 'candidate' }
  ],
  questions: [
    { id: 'q1', text: '结束 PET 是 Deauville 2，后续复查还需要做 PET 吗，还是 CT 就够？', source: '疗效评估 · 本人整理', selected: true, kind: 'fact' },
    { id: 'q2', text: 'IgG 一直在 6 左右，需不需要查疫苗抗体或做其他处理？', source: '免疫球蛋白记录', selected: true, kind: 'fact' },
    { id: 'q3', text: '手指麻木还没完全恢复，随访时需要跟谁说？', source: '不良事件记录', selected: true, kind: 'fact' },
    { id: 'q4', text: '我担心一停药就会回来，这种担心正常吗？', source: '本人看法 · 2026-10-10', selected: true, kind: 'view' }
  ],
  viewpoints: [
    { id: 'v1', d: '2026-10-10', text: '看到"完全代谢缓解"那天很高兴，但这几天又开始担心复发。', role: 'patient' }
  ],
  tasks: [
    { id: 'k1', date: '2026-11-05', title: '复查（血液科）', note: '医院安排 · 带好结束 PET 报告', done: false },
    { id: 'k2', date: '2026-10-24', title: '核对化疗记录', note: '资料整理 · 1 项剂量待确认', done: false },
    { id: 'k3', date: '2026-10-20', title: '把想问的三个问题过一遍', note: '本人安排', done: true }
  ],
  labs: [
    { d: '2026-10-09', item: '中性粒细胞', v: '4.4', unit: '10⁹/L', ref: '1.8–6.3', src: '随访血常规' },
    { d: '2026-10-09', item: '血红蛋白', v: '131', unit: 'g/L', ref: '130–175', src: '随访血常规' },
    { d: '2026-10-09', item: '血小板', v: '212', unit: '10⁹/L', ref: '125–350', src: '随访血常规' },
    { d: '2026-10-09', item: 'LDH', v: '202', unit: 'U/L', ref: '120–250', src: '随访生化' },
    { d: '2026-10-09', item: 'IgG', v: '6.4', unit: 'g/L', ref: '7.0–16.0', src: '随访免疫球蛋白' }
  ],
  infections: [
    { d: '2026-02-18', item: 'HBsAg', v: '阴性', note: '—', src: '治疗前筛查' },
    { d: '2026-02-18', item: 'anti-HBc', v: '阳性', note: '既往感染；使用利妥昔单抗需评估再激活风险', src: '治疗前筛查' },
    { d: '2026-02-18', item: 'HBV-DNA', v: '未检出', note: '基线', src: '治疗前筛查' },
    { d: '2026-07-20', item: 'HBV-DNA', v: '未检出', note: '治疗结束复查', src: '结束评估' },
    { d: '2026-02-18', item: 'EBV-DNA', v: '未检出', note: '—', src: '治疗前筛查' },
    { d: '2026-02-18', item: 'HIV 抗原/抗体', v: '阴性', note: '—', src: '治疗前筛查' }
  ],
  savings: [
    { d: '2026-02-19', title: '生育力保存咨询', detail: '治疗前已转诊生殖医学中心；是否进行由本人与医生决定', status: '已咨询' }
  ]
};

/* ---------------- generic UI ---------------- */
const btn = (text, action, cls = '', attr = '') => `<button class="${cls}" data-action="${action}" ${attr}>${text}</button>`;
const go = (text, page, sub = '', cls = '') => btn(text, 'go', cls, `data-page="${page}" data-sub="${esc(sub)}"`);
const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
const shortDate = (d) => String(d).slice(5).replace('-', '.');
const longDate = (d) => String(d).replace(/-/g, '.');
const fmtNum = (v, dec) => (dec === 0 ? String(Math.round(v)) : Number(v).toFixed(dec ?? 1));
const profile = () => PROFILES.find((p) => p.id === state.profileId) || PROFILES[0];

function toast(t) {
  clearTimeout(state.toastTimer);
  const el = $('#toast'); el.textContent = t; el.classList.add('visible');
  state.toastTimer = setTimeout(() => el.classList.remove('visible'), 3600);
}
function openModal(title, body, foot = '', eyebrow = '小铃铛 · 交互演示') {
  $('#dialog-title').textContent = title;
  $('#dialog-eyebrow').textContent = eyebrow;
  $('#dialog-body').innerHTML = body;
  $('#dialog-foot').innerHTML = foot;
  if (!$('#dialog').open) $('#dialog').showModal();
  document.body.style.overflow = 'hidden';
}
const closeModal = () => $('#dialog').close();
$('#dialog').addEventListener('close', () => { document.body.style.overflow = ''; });

function navigate(page, sub) {
  state.page = page;
  if (sub) state.sub[page] = sub;
  state.query = '';
  try { history.replaceState(null, '', '#' + page + (sub ? '/' + encodeURIComponent(sub) : '')); } catch (e) { /* file:// 下忽略 */ }
  render();
  $('#main').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
const section = (title, desc = '', action = '') => `<div class="section-title"><div><h2>${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${action}</div>`;
const head = (title, desc, action = '') => `<div class="page-head"><div><span class="eyebrow">LYMBELL / YOUR CARE COMPANION</span><h1>${title}</h1><p>${desc}</p></div><div class="actions">${action}</div></div>`;
const subnav = () => {
  const items = SUBPAGES[state.page]; if (!items) return '';
  const sel = state.sub[state.page] || items[0];
  return `<nav class="subnav" role="tablist" aria-label="${PAGES.find((p) => p[0] === state.page)[1]}二级页面">${items.map((s) => `<button role="tab" aria-selected="${sel === s}" data-action="sub" data-sub="${esc(s)}">${s}</button>`).join('')}</nav>`;
};

/* ---------------- charts ---------------- */
const CW = 980, CH = 420, CX0 = 62, CX1 = 954, CY0 = 132, CY1 = 366;

function domain() {
  const end = Date.parse(DATA_END);
  const months = { '3m': 3, '6m': 6, '12m': 12 }[state.range];
  const start = months ? new Date(new Date(end).setMonth(new Date(end).getMonth() - months)) : new Date(DATA_START);
  const span = end - start.getTime();
  const kept = span * state.zoom / 100;
  return [end - kept, end];
}
const inDomain = (d, t0, t1) => { const t = Date.parse(d); return t >= t0 && t <= t1; };
const xOf = (t, t0, t1) => CX0 + (t - t0) / Math.max(1, t1 - t0) * (CX1 - CX0);

function smoothPath(coords) {
  if (!coords.length) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  return coords.reduce((d, p, i) => {
    if (!i) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const prev = coords[i - 1], before = coords[i - 2] || prev, after = coords[i + 1] || p;
    const c1x = prev.x + (p.x - before.x) / 6, c1y = prev.y + (p.y - before.y) / 6;
    const c2x = p.x - (after.x - prev.x) / 6, c2y = p.y - (after.y - prev.y) / 6;
    return `${d} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, '');
}

function treatmentBands(t0, t1) {
  const items = TREATMENTS.filter((tr) => Date.parse(tr.to) >= t0 && Date.parse(tr.from) <= t1)
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  return items.map((tr, lane) => {
    const s = Math.max(Date.parse(tr.from), t0), e = Math.min(Date.parse(tr.to), t1);
    return { ...tr, x1: xOf(s, t0, t1), x2: xOf(e, t0, t1), lane };
  });
}

function monthTicks(t0, t1) {
  const out = []; const d = new Date(t0); let cur = new Date(d.getFullYear(), d.getMonth(), 1);
  if (cur.getTime() < t0) cur.setMonth(cur.getMonth() + 1);
  while (cur.getTime() <= t1) {
    const x = xOf(cur.getTime(), t0, t1);
    if (x > CX0 + 6 && x < CX1 - 6) out.push({ x, label: `${cur.getMonth() + 1}月` });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (out.length > 7) return out.filter((_, i) => i % 2 === 0);
  return out;
}

function seriesFor(code, t0, t1) {
  const m = METRICS[code];
  const all = m.points.map((p) => p.v);
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || Math.max(Math.abs(hi) * 0.08, 1);
  const pts = m.points.filter((p) => inDomain(p.d, t0, t1));
  return { code, m, lo, hi, span, pts };
}

function chartSVG(t0, t1) {
  const bands = state.toggles.treatment ? treatmentBands(t0, t1) : [];
  const series = state.sel.map((c) => seriesFor(c, t0, t1)).filter((s) => s.pts.length);
  if (!series.length) {
    return `<div class="empty"><h3>这个时间窗里没有所选指标</h3><p>扩大时间范围，或在左侧加选一个指标。</p></div>`;
  }
  const yOf = (s, v) => CY1 - (v - s.lo) / s.span * (CY1 - CY0);
  const grid = [0, 1, 2, 3, 4].map((i) => { const y = CY0 + i * (CY1 - CY0) / 4; return `<line class="grid" x1="${CX0}" x2="${CX1}" y1="${y}" y2="${y}"/>`; }).join('');

  // 治疗条独立占顶部两行：化疗周期在 36，评估节点在 64，数据区从 CY0=132 开始，永不压曲线
  const strip = bands.map((b) => {
    if (b.kind === 'surgery' || b.kind === 'mark') {
      const x = b.x1.toFixed(1), row = 64;
      return `<g><path d="M ${x} ${row - 4} l4 4 -4 4 -4 -4 Z" fill="${b.color}"/>
        <text x="${(+x + 8).toFixed(1)}" y="${row + 3.5}" font-size="9.5" fill="${b.color}" font-weight="600">${esc(b.label)}</text></g>`;
    }
    const w = Math.max(b.x2 - b.x1, 7).toFixed(1);
    return `<g><rect x="${b.x1.toFixed(1)}" y="36" width="${w}" height="8" rx="4" fill="${b.color}" opacity=".3"/>
      <text x="${(b.x1 + 1).toFixed(1)}" y="30" font-size="9" fill="${b.color}" font-weight="500">${esc(b.label)}</text></g>`;
  }).join('');

  const markLines = bands.filter((b) => b.kind === 'surgery').map((b) =>
    `<line x1="${b.x1.toFixed(1)}" x2="${b.x1.toFixed(1)}" y1="${CY0}" y2="${CY1}" stroke="${b.color}" stroke-width="1.2" stroke-dasharray="3 6" opacity=".45"/>`).join('');

  // 末点标签统一排版：按 y 排序后强制最小间距 13px，右端一律左锚定，避免叠字与被裁
  const lastPos = series.map((s) => {
    const c = s.pts.map((p) => ({ x: xOf(Date.parse(p.d), t0, t1), y: yOf(s, p.v) }));
    const last = c[c.length - 1];
    return { s, x: last.x, y: last.y, v: s.pts[s.pts.length - 1].v };
  }).sort((a, b) => a.y - b.y);
  let cursor = -Infinity;
  for (const it of lastPos) { it.ly = Math.max(it.y, cursor + 13); cursor = it.ly; }
  const overflow = lastPos.length ? Math.max(0, lastPos[lastPos.length - 1].ly - (CY1 + 2)) : 0;
  if (overflow) for (const it of lastPos) it.ly -= overflow;

  const lines = series.map((s) => {
    const coords = s.pts.map((p) => ({ x: xOf(Date.parse(p.d), t0, t1), y: yOf(s, p.v) }));
    const path = s.pts.length > 1 ? `<path class="line" d="${smoothPath(coords)}" stroke="${s.m.color}" pathLength="1"/>` : '';
    const points = coords.map((c, i) => {
      const p = s.pts[i];
      const isLast = i === s.pts.length - 1;
      const r = isLast ? 5.2 : (i === 0 ? 4.6 : 4);
      const active = state.pin && state.pin.code === s.code && state.pin.date === p.d;
      return `<circle class="pt${active ? ' active' : ''}" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${r}" fill="${s.m.color}" data-action="pin" data-code="${s.code}" data-date="${p.d}"/>`;
    }).join('');
    const lp = lastPos.find((x) => x.s === s);
    const nearRight = lp.x > CX1 - 44;
    const lx = nearRight ? lp.x - 8 : lp.x + 8;
    const label = state.toggles.keypoints
      ? `<text class="delta-tag" x="${lx.toFixed(1)}" y="${(lp.ly + 4).toFixed(1)}" text-anchor="${nearRight ? 'end' : 'start'}" fill="${s.m.color}">${fmtNum(lp.v, s.m.dec)}</text>` : '';
    return `<g>${path}${points}${label}</g>`;
  }).join('');

  const ticks = monthTicks(t0, t1).map((t) => `<line class="axis" x1="${t.x.toFixed(1)}" x2="${t.x.toFixed(1)}" y1="${CY1}" y2="${CY1 + 5}"/><text class="tick" x="${t.x.toFixed(1)}" y="${CY1 + 18}" text-anchor="middle">${t.label}</text>`).join('');

  const rowLabels = state.toggles.treatment
    ? `<text x="6" y="34" font-size="9" fill="#a399b0">周期</text><text x="6" y="68" font-size="9" fill="#a399b0">评估</text>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="所选指标的时序图，共 ${series.length} 条序列">
    ${grid}${ticks}${markLines}${strip}${rowLabels}${lines}
    <text class="tick" x="${CX0}" y="${CY1 + 36}">各序列按自身全部记录的最小值–最大值归一化，不代表数值可比</text>
  </svg>`;
}

/* ---------------- shared blocks ---------------- */
function deauvilleRow(current) {
  const items = [
    [1, '无摄取', '低于本底'],
    [2, '低于纵隔', '纵隔血池以下'],
    [3, '介于纵隔与肝', '高于纵隔、不高于肝'],
    [4, '高于肝', '较肝血池明显升高'],
    [5, '显著高于肝', '或出现新病灶']
  ];
  return `<div class="dv-row">${items.map(([n, t, d]) => `<div class="dv${n === current ? ' on' : ''}"><span>Deauville</span><b>${n} 分</b><p>${t}<br>${d}</p></div>`).join('')}</div>
  <div class="dv-scale">${items.map(([n]) => `<i class="${n === current ? 'on' : ''}"></i>`).join('')}</div>
  <p class="small-note">分数由核医学读片给出，工作台只记录原文；这里不判断病情好坏，也不替代医生解读。</p>`;
}

function metricCard(code) {
  const m = METRICS[code];
  if (!m.points.length) return '';
  const pts = m.points, last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const diff = prev ? last.v - prev.v : 0;
  const unit = m.unit ? `<small>${esc(m.unit)}</small>` : '';
  const arrow = prev ? (diff > 0 ? '↑' : diff < 0 ? '↓' : '→') : '';
  const backPts = pts.slice(-5);
  const bw = 168, bh = 56, bpad = 6;
  const vals = backPts.map((p) => p.v);
  const blo = Math.min(...vals), bhi = Math.max(...vals);
  const bspan = bhi - blo || 1;
  const bx = (i) => bpad + (backPts.length === 1 ? (bw - bpad * 2) / 2 : i / (backPts.length - 1) * (bw - bpad * 2));
  const by = (v) => bh - bpad - (v - blo) / bspan * (bh - bpad * 2);
  const path = backPts.length > 1 ? `<path class="sp-line" d="${smoothPath(backPts.map((p, i) => ({ x: bx(i), y: by(p.v) })))}" stroke="${m.color}" pathLength="1"/>` : '';
  const dots = backPts.map((p, i) => `<circle class="sp-dot" cx="${bx(i).toFixed(1)}" cy="${by(p.v).toFixed(1)}" r="2.8" fill="${m.color}"/>`).join('');
  return `<button class="mcard" aria-pressed="${state.flipped.has(code)}" data-action="flip" data-code="${code}" aria-label="${esc(m.name)}，最新 ${fmtNum(last.v, m.dec)} ${esc(m.unit)}，点击查看最近 ${backPts.length} 次记录">
    <span class="mcard-inner">
      <span class="mface front" aria-hidden="true">
        <span class="cat"><i style="background:${m.color}"></i>${esc(m.cat)}</span>
        <span class="name">${esc(m.name)}</span>
        <span class="val">${fmtNum(last.v, m.dec)}${unit}</span>
        <span class="delta">${prev ? `${arrow} 较前次 <em>${diff > 0 ? '+' : ''}${fmtNum(diff, m.dec)}</em>` : '仅 1 次记录'}</span>
        <span class="rec">共 ${pts.length} 次 · ${esc(shortDate(last.d))}</span>
        <span class="meta"><span>${esc(last.src)}</span><span class="hint">点开看趋势</span></span>
      </span>
      <span class="mface back" aria-hidden="true">
        <span class="cat">最近 ${backPts.length} 次 · ${esc(m.cat)}</span>
        <span class="name">${esc(m.name)}</span>
        <span class="count">${esc(m.note)}</span>
        <svg class="spark" viewBox="0 0 ${bw} ${bh}" aria-hidden="true"><line class="base" x1="${bpad}" x2="${bw - bpad}" y1="${bh - bpad}" y2="${bh - bpad}"/>${path}${dots}</svg>
        <span class="spark-labels"><span>${esc(shortDate(backPts[0].d))}</span><span>${fmtNum(backPts[0].v, m.dec)} → ${fmtNum(last.v, m.dec)}</span><span>${esc(shortDate(last.d))}</span></span>
        <span class="foot">仅回顾已核对记录，不做预测</span>
      </span>
    </span>
  </button>`;
}

/* ---------------- pages ---------------- */
function pageDashboard() {
  const p = profile();
  const todo = state.tasks.filter((t) => !t.done).slice().sort((a, b) => a.date.localeCompare(b.date));
  const next = todo[0];
  const picked = state.questions.filter((q) => q.selected);
  const done = state.docs.filter((d) => d.status === '已核对').length;
  const pending = state.docs.length - done;
  const lineLabel = p.ww ? '观察等待' : p.id === 'p5' ? '第 2 线' : '第 1 线';
  const days = next ? Math.max(0, Math.round((Date.parse(next.date) - Date.parse(DATA_END)) / 86400000)) : null;

  /* 「现在可以做」按画像换第一件事：W&W 看复查、复发看方案、其余看资料 */
  const first = p.ww
    ? ['◷', '观察期的复查怎么排', '节点、项目，以及"什么时候该问"', 'review', '观察等待']
    : p.id === 'p5'
      ? ['↻', '第 2 线在用哪套方案', '方案、周期与剂量调整都在这一页', 'treatment', '当前方案']
      : ['▤', '有一份新报告要核对', `${pending} 份待核对 · 原件已归档`, 'diagnosis', '病理与分子'];
  const entries = [
    first,
    ['＋', '记下今天身体的变化', '发热、口腔、手脚麻木，一条也算', 'care', '症状与日常'],
    ['✎', '把复诊要问的写清', `已选 ${picked.length} 条 · 导出只带选中的`, 'review', '就诊准备'],
    ['↗', '回看指标的变化', '多指标各自刻度，看变化发生在哪一步', 'timeline', '']
  ];

  return `${head('看板', SUBTITLES.dashboard)}
    <div class="intent"><i>◎</i><span><b>今天不用把所有事做完。</b> 先挑一件最清楚的事开始；其余内容都留在这里，随时再看。</span></div>
    ${p.ww ? `<div class="ww-hero">
      <span class="eyebrow">当前策略 · 由治疗团队确定</span>
      <div class="big" style="margin-top:5px">观察等待（Watch &amp; Wait），不是"不治"</div>
      <p>目前没有治疗指征，按 3 个月一次复查。工作台把复查节点、观察期该记的事和想问的问题放在一起；什么时候开始治疗由医生按病灶、症状与血象判断。</p>
      <div class="actions" style="margin-top:14px">${go('看观察期安排', 'review', '观察等待')}${go('记一次复查', 'review', '复诊节奏', 'soft')}</div>
    </div>` : ''}
    ${section('现在可以做', '三个入口，任选一件；都不用先填完整档案。', btn('＋ 记一件事', 'add-mucositis', 'text-button'))}
    <div class="task-grid">
      ${entries.map(([g, t, d, page, sub]) => `<button class="task-entry" data-action="go" data-page="${page}" data-sub="${esc(sub)}">
        <span class="entry-icon">${g}</span><b>${esc(t)}</b><span>${esc(d)}</span><span class="arrow">→</span></button>`).join('')}
    </div>
    <div class="alert-strip">
      <div><b>${p.ww
        ? `下一次复查 ${next ? longDate(next.date) : '待定'}${p.full ? '' : '（示例节点）'}`
        : p.full
          ? '最近一次评估：Deauville 2 · 结束 PET-CT'
          : `当前分型：${esc(p.subtype)}${p.full ? '' : '（示例）'}`}</b>
        <p>${p.ww
          ? `${esc(next ? next.note : '医院安排为准')} · 复查项目与时间以医院通知为准`
          : p.full
            ? '2026-07-20 · 报告原文「代谢低于纵隔」 · 分数由核医学读片给出，工作台只抄原文'
            : '这个画像在原型里只演示元数据与空态，指标序列仍来自 DEMO-1'} · 资料还有 ${pending} 项待核对</p></div>
      <div class="actions">${p.full && !p.ww ? go('看评估依据', 'treatment', '疗效评估', 'soft') : go('看分型依据', 'diagnosis', '病理与分子', 'soft')}${go('问的问题', 'review', '就诊准备', 'soft')}</div>
    </div>
    <div class="dash-cols">
      <div>
        ${section('接下来', next ? `${todo.length} 项未完成 · 按日期排序` : '当前没有新的安排。', go('全部安排', 'review', '复诊节奏'))}
        <div class="card">
          ${todo.length ? todo.slice(0, 3).map((t, i) => `<div class="milestone ${i === 0 ? 'on' : ''}"><span class="dot"></span>
            <div><b>${esc(longDate(t.date))} · ${esc(t.title)}</b><p>${esc(t.note)}</p></div>
            <small>${i === 0 && days !== null ? `${days} 天后` : '待办'}</small></div>`).join('')
            : `<div class="empty"><h3>暂时没有安排</h3><p>下一次复查定下来之后再记，不影响现在看别的。</p></div>`}
          <p class="small-note" style="margin-top:10px">这里只放你记下的安排；工作台不替你排复查节奏。</p>
        </div>
        ${section('最近的变化', '只显示已核对记录；点卡片可翻到背面看最近 5 次。', go('全部指标', 'timeline'))}
        <div class="metric-grid">${metricCard('ldh')}${metricCard('lesion')}${metricCard('anc')}${metricCard('wt')}</div>
      </div>
      <div class="stack">
        <div class="card accent">
          <div class="card-head"><div><h3>当前分型</h3><p>分型是这条路径的起点，依据在「我的分型」。</p></div>${pill('病理确诊', 'violet')}</div>
          <div class="stat-band" style="border-top:0;padding-top:0;margin-top:0">
            <div><b>${esc(p.subtype)}</b><br>亚型</div>
            <div><b>${esc(p.stage)}</b><br>分期（医生判定）</div>
            <div><b>${lineLabel}</b><br>治疗线</div>
          </div>
          <div class="divider"></div>
          <div class="row"><div class="row-main"><div><b>${esc(p.plan)}</b><p>${esc(p.phase)}</p></div></div>${go('看方案', 'treatment', '当前方案')}</div>
          ${p.ww
            ? `<div class="row"><div class="row-main"><div><b>还没有开始治疗</b><p>观察等待期间不做疗效评估；复查项目由治疗团队安排。</p></div></div>${go('看观察期安排', 'review', '观察等待')}</div>`
            : p.full
              ? `<div class="row"><div class="row-main"><div><b>最近评估：Deauville 2</b><p>2026-07-20 · 报告原文「代谢低于纵隔」</p></div></div>${go('看依据', 'treatment', '疗效评估')}</div>`
              : `<div class="row"><div class="row-main"><div><b>本画像没有独立的评估记录</b><p>指标与节点来自 DEMO-1，仅用于演示界面。</p></div></div>${go('看评估页', 'treatment', '疗效评估')}</div>`}
        </div>
        <div class="card">
          <div class="card-head"><div><h3>资料与缺口</h3><p>原件、识别候选、本人核对三件事分开记。</p></div>${pill(`${done}/${state.docs.length}`, pending ? 'yellow' : 'green')}</div>
          <div class="stat-band" style="border-top:0;padding-top:0;margin-top:0">
            <div><b>${done}</b>份已核对</div>
            <div><b>${pending}</b>份待核对</div>
            <div><b>${state.candidates.length}</b>条识别候选</div>
          </div>
          <div class="divider"></div>
          ${state.docs.slice(0, 2).map((d) => `<div class="row"><div class="row-main"><div><b>${esc(d.name)}</b><p>${esc(shortDate(d.date))} · ${esc(d.type)}</p></div></div>${pill(d.status, d.status === '已核对' ? 'green' : 'yellow')}</div>`).join('')}
          <div class="actions" style="margin-top:12px">${go('去核对', 'diagnosis', '病理与分子', 'soft')}</div>
        </div>
        <div class="card">
          <div class="card-head"><div><h3>想问的事</h3><p>${picked.length} 条已选；导出只带选中的。</p></div>${go('编辑', 'review', '就诊准备')}</div>
          ${picked.slice(0, 2).map((q) => `<div class="row"><div class="row-main"><div><b>${esc(q.text)}</b><p>${esc(q.source)}</p></div></div>${q.kind === 'view' ? pill('我的看法', 'grey') : ''}</div>`).join('')}
          <div class="small-note" style="margin-top:10px">标了「我的看法」的只作信息，不当结论。</div>
        </div>
      </div>
    </div>`;
}

function pageDiagnosis() {
  const sub = state.sub.diagnosis || '分型档案';
  const p = profile();
  if (sub === '病理与分子') return pagePathology();
  if (sub === '分期与病灶') return pageStaging();
  if (sub === '会诊与二次意见') return pageSecondOpinion();
  if (sub === '分型库') return pageSubtypeLibrary();
  return `${head('我的分型', SUBTITLES.diagnosis, go('看病理原文', 'diagnosis', '病理与分子', 'soft'))}
    ${subnav()}
    <div class="subtype-hero">
      <div>
        <span class="code">WHO-HAEM5 · 成熟 B 细胞肿瘤</span>
        <h2>${esc(p.subtype)}</h2>
        <div class="en">Diffuse Large B-Cell Lymphoma, Not Otherwise Specified</div>
        <div class="subtype-meta">${pill('非生发中心表型', 'violet')}${pill('EBER 阴性', 'grey')}${pill('双打击已排除', 'grey')}${pill('诊断日期 2026-02-18', 'grey')}</div>
        <p class="small-note" style="max-width:64ch">这份档案抄录病理报告与门诊记录的原话。分型可能因会诊、补充免疫组化或分子检测而修正；修正会作为新版本保留，不覆盖旧记录。</p>
      </div>
      <div>
        <h3 style="font-size:12px;color:var(--muted);margin-bottom:8px">当前分型在分类树中的位置</h3>
        <div class="path-tree">
          ${SUBTYPE_TREE.map((n) => `<div class="${n.on ? 'on' : ''} lv${n.lv}">${esc(n.name)}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><h3>诊断依据摘要</h3><p>三条足以支撑当前分型的证据。</p></div>${pill('已核对', 'green')}</div>
        <div class="row"><div class="row-main"><div><b>形态与免疫表型</b><p>弥漫性大细胞浸润；CD20+、CD10−、MUM1+，符合非生发中心来源</p></div></div><button class="source-link" data-action="src" data-src="病理报告 · 2026-02-18 · 第 2 页">原文</button></div>
        <div class="row"><div class="row-main"><div><b>增殖指数</b><p>Ki-67 约 80%，支持侵袭性淋巴瘤</p></div></div><button class="source-link" data-action="src" data-src="病理报告 · 2026-02-18 · 第 3 页">原文</button></div>
        <div class="row"><div class="row-main"><div><b>排除双打击</b><p>MYC、BCL2、BCL6 重排均为阴性（FISH）</p></div></div><button class="source-link" data-action="src" data-src="FISH 报告 · 2026-02-21">原文</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>还需要确认的两件事</h3><p>不影响已经开始的事，但下次讨论可以问。</p></div></div>
        <div class="notice warn" style="margin-bottom:12px">这份档案只记录医生给出的分型与分期，不计算评分、不做预后判断，也不给治疗建议。</div>
        <div class="row"><div class="row-main"><div><b>分期依据是否齐全</b><p>PET-CT（2026-02-20）、骨髓活检与流式（02-19）、体格检查（02-18）</p></div></div>${pill('已核对 3 / 3', 'green')}</div>
        <div class="row"><div class="row-main"><div><b>是否需要上级医院病理会诊</b><p>目前诊断与治疗在同一家中心完成；如计划换院，需带切片</p></div></div>${pill('未决定', 'grey')}</div>
        <div class="actions" style="margin-top:12px">${go('去会诊记录', 'diagnosis', '会诊与二次意见', 'soft')}</div>
      </div>
    </div>`;
}

function pagePathology() {
  return `${head('病理与分子', '抄录报告原文，不解释、不改写；标记的解释权在病理科。', go('看分期', 'diagnosis', '分期与病灶', 'soft'))}
    ${subnav()}
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div><span class="eyebrow">病理报告 · 2026-02-18</span><h2 style="margin-top:4px">纵隔 4R 淋巴结活检</h2><p>报告号 P2026-0218-07 · 出具机构原文已归档</p></div>${pill('已核对', 'green')}</div>
      <div class="notice plain" style="margin:0"><b>诊断原文：</b>「弥漫大 B 细胞淋巴瘤，非特指型（DLBCL, NOS）；结合免疫表型符合非生发中心 B 细胞来源。」<br><span class="muted">以上为原文抄录，本页不追加解释。</span></div>
    </div>
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><h3>免疫组化（IHC）</h3><p>9 项，其中 1 项未检测。</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>标记</th><th>结果</th><th>报告备注</th></tr></thead><tbody>
          ${IHC.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td class="muted">${esc(r[2]) || '—'}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>FISH 与分子检测</h3><p>用于排除高级别 B 细胞淋巴瘤。</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>检测</th><th>结果</th><th>备注</th></tr></thead><tbody>
          ${FISH.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${pill('阴性', 'grey')}</td><td class="muted">${esc(r[2]) || '—'}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="help-box">「阴性」是报告结论，不是工作台的判断。若报告写「未检测」或「取材不足」，这里会原样显示，不会补成阴性。</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><h3>原报告与核对</h3><p>原件存在你选的资料目录，不上传云端。</p></div></div>
      <div class="row"><div class="row-main"><div><b>病理报告 PDF</b><p>2026-02-18 · 6 页 · 已核对 3 项关键字段</p></div></div>${pill('本机', 'grey')}</div>
      <div class="row"><div class="row-main"><div><b>FISH 报告</b><p>2026-02-21 · 2 页</p></div></div>${pill('已核对', 'green')}</div>
    </div>`;
}

function pageSubtypeLibrary() {
  const rows = SUBTYPES.filter((r) => state.libLine === 'all' || r[0] === state.libLine);
  const chips = [['all', '全部'], ['B', 'B 细胞'], ['T', 'T / NK 细胞'], ['H', '霍奇金']];
  return `${head('分型库', '首批覆盖 NCCN 2025 有独立诊疗路径的亚型；这里只做对照，不解释预后，也不推荐方案。')}
    ${subnav()}
    <div class="notice violet">共 <b>${SUBTYPES.length}</b> 个亚型进入首批范围。新增亚型只改数据表，不新增页面；每个患者的档案只记录"自己的那一型"，不需要在 24 项里做选择练习。</div>
    <div class="chips" style="margin-bottom:12px">
      ${chips.map(([k, l]) => `<button class="chip" aria-pressed="${state.libLine === k}" data-action="libline" data-line="${k}">${l}</button>`).join('')}
    </div>
    <div class="card">
      <div class="table-wrap"><table class="cycle-table"><thead><tr><th>谱系</th><th>缩写</th><th>中文名</th><th>恶性程度</th><th>常见就诊科室</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(LINEAGE_LABEL[r[0]])}</td><td><b>${esc(r[1])}</b></td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td class="muted">${esc(r[4])}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">「恶性程度」抄自用户提供的分类表，属参考信息，不是预后判断。当前显示 ${rows.length} / ${SUBTYPES.length} 项。</p>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>每个亚型的档案记录什么</h3></div></div>
        <div class="flag-list">
          <div>分型名称（中文全称 + 英文 + 缩写）与诊断日期</div>
          <div>出具机构、报告号、是否经过会诊</div>
          <div>支撑该分型的 IHC / FISH / 分子结果</div>
          <div>修正记录（旧值、新值、日期、依据）</div>
        </div>
      </div>
      <div class="card"><div class="card-head"><div><h3>不记录什么</h3></div></div>
        <div class="flag-list">
          <div>预后评分与风险分组（医生的工作）</div>
          <div>治愈率、生存期、复发概率</div>
          <div>方案推荐、药物选择、临床试验排序</div>
        </div>
        <div class="actions" style="margin-top:12px">${go('看当前分型档案', 'diagnosis', '分型档案', 'soft')}</div>
      </div>
    </div>`;
}

function pageStaging() {
  return `${head('分期与病灶', 'Lugano 分期由医生按影像判定；这里记录判定结果与依据。', go('去疗效评估', 'treatment', '疗效评估', 'soft'))}
    ${subnav()}
    <div class="grid three">
      <div class="card accent"><span class="eyebrow">Lugano 分期</span><h2 style="font-size:26px;margin-top:4px">II A</h2><p style="font-size:12px;margin-top:4px">横膈同侧 ≥2 个淋巴结区；无 B 症状</p></div>
      <div class="card"><span class="eyebrow">病灶总径（基线）</span><h2 style="font-size:26px;margin-top:4px">6.8 cm</h2><p style="font-size:12px;margin-top:4px">最大病灶：纵隔 4R，SUVmax 22.6</p></div>
      <div class="card"><span class="eyebrow">骨髓</span><h2 style="font-size:26px;margin-top:4px">未受累</h2><p style="font-size:12px;margin-top:4px">2026-02-19 骨髓活检与流式均未见侵犯</p></div>
    </div>
    ${section('基线病灶', '同一部位、同一测量方式才可比；后续评估对照这张表。')}
    <div class="card">
      <div class="table-wrap"><table class="cycle-table"><thead><tr><th>部位</th><th>最大长径</th><th>SUVmax</th><th>来源</th></tr></thead><tbody>
        ${LESIONS.map((l) => `<tr><td><b>${esc(l.site)}</b></td><td class="num">${esc(l.size)}</td><td class="num">${esc(l.suv)}</td><td class="muted">${esc(l.src)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">病灶表在 936px 业务区下需要整行显示；窄屏横向滚动时表头保持可见。这条布局规则沿用乳腺工作台的实测结论（见 UI-DESIGN §6）。</p>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>B 症状</h3><p>由医生问诊记录，不由工作台推断。</p></div></div>
        <div class="row"><div class="row-main"><div><b>发热</b><p>无不明原因发热</p></div></div>${pill('无', 'grey')}</div>
        <div class="row"><div class="row-main"><div><b>盗汗</b><p>无</p></div></div>${pill('无', 'grey')}</div>
        <div class="row"><div class="row-main"><div><b>体重下降</b><p>近 6 个月无明显下降</p></div></div>${pill('无', 'grey')}</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>结外受累</h3><p>影响分期与后续评估部位。</p></div></div>
        <div class="notice plain" style="margin:0">基线影像未报告结外器官受累；骨髓、中枢神经系统评估见对应记录。若后续出现新部位，会作为新病灶记录，不覆盖基线。</div>
      </div>
    </div>`;
}

function pageSecondOpinion() {
  return `${head('会诊与二次意见', '换医院、补检测、病理复核都会改变分型；这些变动要留痕。', btn('记一次会诊', 'add-opinion', 'primary'))}
    ${subnav()}
    <div class="notice violet">换院时通常需要借出<b>病理切片与蜡块</b>，不是只带报告。具体流程由接收医院病理科说明，本页只做清单。</div>
    <div class="card">
      <div class="card-head"><div><h3>已记录的会诊</h3><p>1 次</p></div></div>
      <div class="row"><div class="row-main"><div><b>2026-02-26 · 上级医院病理会诊</b><p>结论：与初诊一致（DLBCL, NOS）。未改变分型，未改变治疗方案。</p><p class="muted">会诊意见书已归档 · 由本人提供</p></div></div>${pill('一致', 'green')}</div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>如果要再会诊，需要带什么</h3></div></div>
        <div class="flag-list">
          <div>病理报告原件与复印件</div>
          <div>未染色切片、蜡块（向原医院病理科借出）</div>
          <div>影像原片或光盘（PET-CT、CT）</div>
          <div>治疗记录与用药清单</div>
        </div>
      </div>
      <div class="card"><div class="card-head"><div><h3>会诊可能改变什么</h3></div></div>
        <div class="notice warn" style="margin:0">可能改变亚型、分级或治疗方案。工作台不会预测概率，也不会建议是否会诊；这件事由你和主治医生讨论。</div>
        <div class="actions" style="margin-top:12px">${go('把这个问题写进就诊准备', 'review', '就诊准备', 'soft')}</div>
      </div>
    </div>`;
}

function pageTreatment() {
  const sub = state.sub.treatment || '当前方案';
  if (sub === '周期与用药') return pageCycles();
  if (sub === '疗效评估') return pageResponse();

  const lineStrip = `<div class="line-strip" role="group" aria-label="治疗线切换">
      <button class="line-chip" aria-pressed="${state.line === 1}" data-action="line" data-line="1">第 1 线 · R-CHOP（已完成）</button>
      <button class="line-chip" aria-pressed="${state.line === 2}" data-action="line" data-line="2">第 2 线 · 未开始</button>
    </div>`;

  // 第 2 线没有数据时整页只显示空态，避免把第 1 线的方案与节点混进来
  if (state.line === 2) {
    return `${head('治疗历程', SUBTITLES.treatment)}${subnav()}${lineStrip}
      <div class="empty"><h3>还没有第二线记录</h3>
      <p>如果进入下一线治疗，新的方案、周期与评估会作为独立的一组记录，不覆盖第 1 线。<br>工作台不会提示"该换线了"——那是治疗团队的判断。</p>
      <div class="actions" style="justify-content:center;margin-top:12px">${btn('记一条新治疗线', 'add-line', 'soft')}${btn('回到第 1 线', 'line', 'soft', 'data-line="1"')}</div></div>`;
  }

  return `${head('治疗历程', SUBTITLES.treatment, go('看周期表', 'treatment', '周期与用药', 'soft'))}
    ${subnav()}
    ${lineStrip}
    <div class="plan-card" style="margin-bottom:14px">
      <div>
        <span class="eyebrow">一线方案 · 第 1 线</span>
        <div class="big" style="margin-top:4px">R-CHOP <small>× 6 周期 · 已完成</small></div>
        <p style="font-size:12.5px;margin-top:6px">2026-03-02 起，末次给药 2026-06-15；第 3 周期因发热性中性粒细胞减少延迟 7 天。</p>
        <div class="progress"><i style="width:100%"></i></div>
        <p class="small-note">6 / 6 周期 · 实际完成 6 周期 · 1 次延迟 · 1 次减量</p>
      </div>
      <div style="text-align:right">
        ${pill('已完成', 'green')}
        <p style="font-size:11px;margin-top:8px">下一步：随访<br>2026-11-05</p>
      </div>
    </div>
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><h3>方案组成</h3><p>剂量与调整以医嘱单为准，这里只抄录。</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>药物</th><th>本次剂量</th><th>说明</th></tr></thead><tbody>
          <tr><td><b>利妥昔单抗 R</b></td><td class="num">375 mg/m²</td><td class="muted">静脉输注</td></tr>
          <tr><td><b>环磷酰胺 C</b></td><td class="num">750 mg/m²</td><td class="muted">静脉</td></tr>
          <tr><td><b>多柔比星 H</b></td><td class="num">50 mg/m²</td><td class="muted">静脉</td></tr>
          <tr><td><b>长春新碱 O</b></td><td class="num">1.4 mg/m²（上限 2 mg）</td><td class="muted">第 4 周期减量 25%</td></tr>
          <tr><td><b>泼尼松 P</b></td><td class="num">100 mg × 5 天</td><td class="muted">口服</td></tr>
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>支持用药</h3><p>预防与支持由医生开立。</p></div></div>
        <div class="row"><div class="row-main"><div><b>G-CSF</b><p>每周期后使用，具体品种与天数见医嘱</p></div></div>${pill('已用', 'green')}</div>
        <div class="row"><div class="row-main"><div><b>止吐方案</b><p>5-HT3 拮抗剂 + 地塞米松</p></div></div>${pill('已用', 'green')}</div>
        <div class="row"><div class="row-main"><div><b>HBV 再激活预防</b><p>anti-HBc 阳性，医生已开预防用药；具体药物与疗程见处方</p></div></div>${pill('进行中', 'violet')}</div>
        <div class="row"><div class="row-main"><div><b>肺孢子菌肺炎（PJP）预防</b><p>化疗期间按医嘱服用</p></div></div>${pill('已用', 'green')}</div>
      </div>
    </div>
    ${section('这一线的关键节点', '')}
    <div class="card">
      <div class="milestone on"><span class="dot"></span><div><b>治疗前评估</b><p>病理、PET-CT、骨髓、心脏超声、感染筛查</p></div><small>2026-02-18 ~ 02-28</small></div>
      <div class="milestone on"><span class="dot"></span><div><b>治疗前 · 生育力保存咨询</b><p>2026-02-19 转诊生殖医学中心；是否进行由本人与医生决定。时间点关键：多数方案一旦开始，可选项会变少。</p></div><small>2026-02-19</small></div>
      <div class="milestone on"><span class="dot"></span><div><b>R-CHOP 第 1–3 周期</b><p>第 2 周期后发热性中性粒细胞减少，住院 3 天；第 3 周期延迟 7 天</p></div><small>2026-03-02 ~ 04-20</small></div>
      <div class="milestone on"><span class="dot"></span><div><b>中期评估（PET-CT）</b><p>Deauville 3；医生记录为部分代谢缓解，继续原方案</p></div><small>2026-05-18</small></div>
      <div class="milestone on"><span class="dot"></span><div><b>R-CHOP 第 4–6 周期</b><p>第 4 周期长春新碱减量 25%；其余足量</p></div><small>2026-05-04 ~ 06-15</small></div>
      <div class="milestone on"><span class="dot"></span><div><b>结束评估</b><p>PET-CT Deauville 2；医生记录为完全代谢缓解</p></div><small>2026-07-20</small></div>
    </div>`;
}

function pageCycles() {
  return `${head('周期与用药', '计划与实际分开记；延迟、减量、停药都保留原因。', btn('记一次用药', 'add-cycle', 'soft'))}
    ${subnav()}
    <div class="card">
      <div class="table-wrap"><table class="cycle-table"><thead><tr><th>周期</th><th>计划日</th><th>实际日</th><th>延迟</th><th>剂量调整</th><th>备注</th></tr></thead><tbody>
        ${CYCLES.map((c) => `<tr class="${c.n <= 6 ? 'done' : ''}"><td><b>第 ${c.n} 周期</b></td><td class="num">${esc(c.plan)}</td><td class="num">${esc(c.real)}</td><td class="num">${esc(c.delay)}</td><td>${esc(c.adjust)}</td><td class="muted">${esc(c.note)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">「计划日」来自初始方案，「实际日」来自给药记录。工作台不会把延迟改写成新计划——两者都留着，才能回答"当时为什么改"。</p>
    </div>
    ${section('用药与不良事件的对应', '只记录时间关系，不判断因果。')}
    <div class="card">
      ${AEs.map((a) => `<div class="row"><div class="row-main"><div><b>${esc(a.name)} · CTCAE ${a.grade} 级</b><p>${esc(a.note)}</p><p class="muted">${esc(longDate(a.d))} · ${esc(a.src)}</p></div></div>${pill(`CTCAE ${a.grade}`, a.grade >= 3 ? 'red' : a.grade === 2 ? 'yellow' : 'grey')}</div>`).join('')}
      <p class="small-note">分级按病历原文抄录。工作台不做因果判断，也不评价处理是否恰当。</p>
    </div>`;
}

function pageResponse() {
  return `${head('疗效评估', 'Deauville 分数与结论来自读片医生；这里只把时间点和原文摆在一起。', go('看影像表', 'labs', '影像与 PET', 'soft'))}
    ${subnav()}
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div><span class="eyebrow">最近一次 · 2026-07-20 · 结束治疗</span><h2 style="margin-top:4px">Deauville 2 分</h2><p>报告结论：「代谢低于纵隔，考虑完全代谢缓解。」</p></div>${pill('医生记录：CR（原文）', 'green')}</div>
      ${deauvilleRow(2)}
    </div>
    ${section('三次评估放一起', '体表病灶用长径，代谢用 Deauville；两者不互相替代。')}
    <div class="card">
      <div class="table-wrap"><table class="cycle-table"><thead><tr><th>时间点</th><th>日期</th><th>Deauville</th><th>最大病灶</th><th>报告结论</th><th>出处</th></tr></thead><tbody>
        ${PETS.map((p) => `<tr><td><b>${esc(p.when)}</b></td><td class="num">${esc(p.d)}</td><td class="num">${p.dv} 分</td><td class="num">${esc(p.size)}</td><td>${esc(p.result)}</td><td class="muted">${esc(p.src)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>中期那张报告写了什么</h3><p>这是当时最让人不安的一次。</p></div></div>
        <div class="notice plain" style="margin:0">报告写「高于纵隔、不高于肝血池」。医生当时的记录是「部分代谢缓解，继续原方案，结束再评估」。工作台保留这句原话，不把它解释成"好"或"不好"。</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>随访期还要不要做 PET</h3><p>这是下次门诊可以问的问题之一。</p></div></div>
        <div class="notice violet" style="margin:0">不同亚型、不同阶段的复查方式不一样，通常由治疗团队按指南与具体情况安排。工作台不给出复查方案。</div>
        <div class="actions" style="margin-top:12px">${go('写进问题清单', 'review', '就诊准备', 'soft')}</div>
      </div>
    </div>`;
}

function pageLabs() {
  const sub = state.sub.labs || '血象';
  if (sub === '生化与免疫') return pageChem();
  if (sub === '感染监测') return pageInfection();
  if (sub === '影像与 PET') return pageImaging();
  return `${head('血象', SUBTITLES.labs, go('看一图秀', 'timeline', '', 'soft'))}
    ${subnav()}
    <div class="metric-grid" style="margin-bottom:14px">${metricCard('anc')}${metricCard('hgb')}${metricCard('plt')}${metricCard('crp')}</div>
    <div class="card">
      <div class="card-head"><div><h3>最近一次血常规（2026-10-09）</h3><p>参考区间来自报告单，换医院会变。</p></div>${pill('已核对', 'green')}</div>
      <div class="table-wrap"><table><thead><tr><th>项目</th><th>结果</th><th>单位</th><th>参考区间</th><th>来源</th></tr></thead><tbody>
        ${state.labs.filter((l) => ['中性粒细胞', '血红蛋白', '血小板'].includes(l.item)).map((l) => `<tr><td><b>${esc(l.item)}</b></td><td class="num">${esc(l.v)}</td><td>${esc(l.unit)}</td><td class="num muted">${esc(l.ref)}</td><td class="muted">${esc(l.src)}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small-note">不按"正常/异常"着色：参考区间因实验室与人群而异，颜色会制造并不存在的确定感。</p>
    </div>
    ${section('最低点与支持', '化疗后的低谷是预期内的事，处理由医生决定。')}
    <div class="grid three">
      <div class="card"><span class="eyebrow">中性粒细胞最低点</span><h2 style="font-size:24px;margin-top:4px">0.8</h2><p style="font-size:12px">2026-04-25 · 第 3 周期后 · 10⁹/L</p></div>
      <div class="card"><span class="eyebrow">血红蛋白最低点</span><h2 style="font-size:24px;margin-top:4px">98</h2><p style="font-size:12px">2026-04-25 · g/L · 未输血</p></div>
      <div class="card"><span class="eyebrow">血小板最低点</span><h2 style="font-size:24px;margin-top:4px">88</h2><p style="font-size:12px">2026-04-25 · 10⁹/L · 未输注</p></div>
    </div>`;
}

function pageChem() {
  return `${head('生化与免疫', '肿瘤负荷、代谢与免疫球蛋白分开看，不合并成一个"情况好不好"。')}
    ${subnav()}
    <div class="metric-grid" style="margin-bottom:14px">${metricCard('ldh')}${metricCard('uric')}${metricCard('igg')}${metricCard('lesion')}</div>
    <div class="grid two">
      <div class="card"><div class="card-head"><div><h3>LDH 怎么看</h3></div></div>
        <div class="notice plain" style="margin:0">LDH 在治疗前 520 U/L，结束评估 195 U/L。它也会因运动、溶血、感染升高，<b>单次升高不特指复发</b>。工作台不做趋势判断。</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>IgG 偏低意味着什么</h3></div></div>
        <div class="notice plain" style="margin:0">利妥昔单抗后 IgG 可能长期偏低，与感染风险的关系需要医生结合临床判断。是否需要补充免疫球蛋白、是否调整预防，都不是工作台能回答的。</div>
        <div class="actions" style="margin-top:12px">${go('把 IgG 写进问题', 'review', '就诊准备', 'soft')}</div>
      </div>
    </div>`;
}

function pageInfection() {
  return `${head('感染监测', '淋巴瘤治疗里最需要提前知道的一件事：什么情况要立刻联系团队。')}
    ${subnav()}
    <div class="notice danger"><b>中性粒细胞减少期间出现发热（体温 ≥38.3℃ 一次，或 ≥38.0℃ 持续 1 小时）→ 立即联系治疗团队。</b><br>这不是分诊建议，也不判断严不严重；只是把"该打电话"的门槛写清楚。是否去急诊由治疗团队按当时情况决定。</div>
    <div class="card">
      <div class="card-head"><div><h3>感染筛查与随访</h3><p>6 项 · 治疗前 5 项，结束评估 1 项。</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>日期</th><th>项目</th><th>结果</th><th>备注</th><th>来源</th></tr></thead><tbody>
        ${state.infections.map((i) => `<tr><td class="num">${esc(i.d)}</td><td><b>${esc(i.item)}</b></td><td>${esc(i.v)}</td><td class="muted">${esc(i.note)}</td><td class="muted">${esc(i.src)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>HBV 这条线为什么单独列</h3></div></div>
        <div class="notice warn" style="margin:0">HBsAg 阴性但 anti-HBc 阳性，使用含利妥昔单抗的方案时需要评估再激活风险。预防用药与监测频率由医生决定；工作台只把三次结果排在一起。</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>发热记录</h3></div></div>
        <div class="row"><div class="row-main"><div><b>2026-04-26 · 38.6℃</b><p>ANC 0.8；当天联系团队后住院 3 天</p></div></div>${pill('已记录', 'grey')}</div>
        <div class="row"><div class="row-main"><div><b>2026-09-12 · 37.4℃</b><p>咽部不适，次日缓解；未联系团队</p></div></div>${pill('已记录', 'grey')}</div>
        ${btn('记一次体温', 'add-fever', 'soft', 'style="margin-top:12px"')}
      </div>
    </div>`;
}

function pageImaging() {
  return `${head('影像与 PET', '影像原片与报告分开存；报告结论按原文抄录。', go('看疗效评估', 'treatment', '疗效评估', 'soft'))}
    ${subnav()}
    <div class="card">
      <div class="card-head"><div><h3>PET-CT 与 CT 记录</h3><p>3 次 PET，1 次随访 CT。</p></div></div>
      <div class="table-wrap"><table class="cycle-table"><thead><tr><th>日期</th><th>检查</th><th>Deauville</th><th>最大病灶</th><th>结论原文</th><th>出处</th></tr></thead><tbody>
        ${PETS.map((p) => `<tr><td class="num">${esc(p.d)}</td><td><b>${esc(p.when)}</b></td><td class="num">${p.dv} 分</td><td class="num">${esc(p.size)}</td><td>${esc(p.result)}</td><td class="muted">${esc(p.src)}</td></tr>`).join('')}
        <tr><td class="num">2026-10-09</td><td><b>随访 CT</b></td><td class="num">未做</td><td class="num">0.8 cm</td><td>纵隔淋巴结较前相仿</td><td class="muted">CT 报告 · 第 1 页</td></tr>
      </tbody></table></div>
    </div>
    <div class="help-box">不同医院、不同机型的 SUV 不能直接比大小。工作台只保留"同一份报告里的原文"，不把两次 SUV 相减当成变化。</div>`;
}

function pageTimeline() {
  const [t0, t1] = domain();
  const series = state.sel.map((c) => seriesFor(c, t0, t1)).filter((s) => s.pts.length);
  const groups = CATS.map(([cat, color]) => {
    const codes = Object.keys(METRICS).filter((c) => METRICS[c].cat === cat);
    return { cat, color, codes };
  });
  const pinData = state.pin ? METRICS[state.pin.code].points.find((p) => p.d === state.pin.date) : null;
  return `${head('病情一图秀', SUBTITLES.timeline, `<div class="chips">${[['3m', '近 3 月'], ['6m', '近 6 月'], ['12m', '近 12 月'], ['all', '全期']].map(([k, l]) => `<button class="chip" aria-pressed="${state.range === k}" data-action="range" data-range="${k}">${l}</button>`).join('')}</div>`)}
    <div class="overview">
      <aside class="rail" aria-label="筛选与指标选择">
        <details class="pick" ${state.sel.length && window.innerWidth > 900 ? 'open' : ''}>
          <summary>选择指标 <small>最多 4 个 · 已选 ${state.sel.length}</small></summary>
          <div class="metric-list">
            ${groups.map((g) => `<div class="cat-label">${esc(g.cat)}</div>${g.codes.map((c) => `<label class="metric-pick"><input type="checkbox" ${state.sel.includes(c) ? 'checked' : ''} data-action="sel" data-code="${c}"><i style="background:${METRICS[c].color}"></i><span>${esc(METRICS[c].name)}</span><small>${METRICS[c].points.length} 次</small></label>`).join('')}`).join('')}
          </div>
        </details>
        <section><h3>显示</h3>
          <div class="chips">
            <button class="chip" aria-pressed="${state.toggles.treatment}" data-action="toggle" data-key="treatment">治疗节点</button>
            <button class="chip" aria-pressed="${state.toggles.keypoints}" data-action="toggle" data-key="keypoints">末点数值</button>
          </div>
        </section>
        <section><h3>时间窗缩放</h3>
          <div class="zoom"><input type="range" min="40" max="100" value="${state.zoom}" data-action="zoom" aria-label="时间窗缩放"><span>${state.zoom}%</span></div>
          <p class="small-note">右端锚定最新记录；40% 表示只看最近四成时间。</p>
        </section>
        <section><h3>口径</h3><p class="small-note">每条线按该指标全部记录的最小值–最大值归一化，只用于同屏回顾，不能比较不同指标的绝对值。</p></section>
      </aside>
      <div class="timeline-main">
        <div class="chart-panel">
          <div class="chart-top">
            <div><h2 style="font-size:15px">${series.length} 条序列 · ${state.range === 'all' ? '全期' : '近 ' + state.range.replace('m', ' 月')}</h2><p class="small-note">悬停看数值，点击固定详情；治疗条与数据区分离，不压曲线。</p></div>
            <span class="pill grey">${t1 > t0 ? `${new Date(t0).toISOString().slice(5, 10).replace('-', '.')} – ${new Date(t1).toISOString().slice(5, 10).replace('-', '.')}` : ''}</span>
          </div>
          <div class="legend">${series.map((s) => `<span><i style="background:${s.m.color}"></i><b>${esc(s.m.name)}</b><span class="range">${fmtNum(s.lo, s.m.dec)}–${fmtNum(s.hi, s.m.dec)} ${esc(s.m.unit)}</span></span>`).join('')}</div>
          <p class="scroll-hint small-note">图表可左右滑动</p>
          <div class="chart-wrap">${chartSVG(t0, t1)}</div>
          ${pinData ? `<div class="pin"><div><b>${esc(METRICS[state.pin.code].name)} · ${fmtNum(pinData.v, METRICS[state.pin.code].dec)} ${esc(METRICS[state.pin.code].unit)}</b><p>${esc(longDate(pinData.d))} · 来源：${esc(pinData.src)}</p></div><button class="icon-button" data-action="unpin" aria-label="关闭详情">×</button></div>` : ''}
        </div>
        ${section('指标卡片', '点一张卡翻到背面；每张卡的翻转状态互不影响。')}
        ${groups.map((g) => `<div class="metric-group"><div class="metric-group-head"><h3>${esc(g.cat)}</h3><span>${g.codes.length} 项</span></div><div class="metric-grid">${g.codes.map(metricCard).join('')}</div></div>`).join('')}
      </div>
    </div>`;
}

/* ---------------- 营养支持 ---------------- */
function pageNutrition() {
  const sub = state.sub.nutrition || '进食与体重';
  if (sub === '当下困扰') return pageNutritionTrouble();
  return `${head('进食与体重', SUBTITLES.nutrition, btn('记一次体重', 'add-meal', 'primary'))}
    ${subnav()}
    <div class="grid two">
      <div class="card"><div class="card-head"><div><h3>体重</h3><p>治疗前 72.0 kg → 最低 69.2 kg → 现在 71.3 kg（4 次记录）</p></div>${pill('轻记录', 'green')}</div>${metricCard('wt')}</div>
      <div class="card"><div class="card-head"><div><h3>记什么才有用</h3><p>有用的不是"今天吃了什么"，而是"什么时候开始掉"。</p></div></div>
        <div class="row"><div class="row-main"><div><b>频率：每周一次就够</b><p>同一台秤、同一时间称，比每天称更可比</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>一起记两件事</b><p>吃不下持续了几天；有没有口腔疼痛或味觉改变</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>不写结论</b><p>体重下降不等于治疗无效，也不等于营养不良——判断归治疗团队</p></div></div></div>
      </div>
    </div>
    <div class="help-box">是否需要用营养补充剂、是否需要营养科会诊，由治疗团队判断。工作台不提供食谱、热量目标或剂量建议。</div>`;
}

function pageNutritionTrouble() {
  return `${head('当下困扰', '只记"卡在哪一步"，不记"应该吃什么"。')}
    ${subnav()}
    <div class="grid three">
      <div class="topic-card"><h3>吃不下</h3><p>记录连续几天、每餐大概吃了多少、有没有恶心或早饱。只记发生次数，不换算热量。</p><div class="actions">${btn('记一次进食情况', 'add-meal', 'soft')}</div></div>
      <div class="topic-card"><h3>味觉改变</h3><p>第 3–4 周期明显，治疗结束后逐渐恢复。记"什么味道变了"，比记"难吃"更有用。</p><div class="actions">${btn('记一次味觉', 'add-meal', 'soft')}</div></div>
      <div class="topic-card"><h3>口腔疼痛影响进食</h3><p>2026-05-12 起 5 天，喝水受影响。记下是否影响进食与饮水，就诊时一并说明。</p><div class="actions">${btn('记一次口腔情况', 'add-mucositis', 'soft')}</div></div>
    </div>
    <div class="notice plain">这些是"发生了什么的记录"。要不要用漱口液、止痛或营养支持，由治疗团队决定；工作台不判断严重程度。</div>`;
}

/* ---------------- 心理支持 ---------------- */
function pageMind() {
  const sub = state.sub.mind || '当下感受';
  if (sub === '生育与家庭') return pageMindFertility();
  return `${head('当下感受', SUBTITLES.mind, btn('记一句', 'add-view', 'primary'))}
    ${subnav()}
    <div class="grid two">
      <div class="card private"><div class="card-head"><div><h3>我记下的</h3><p>只作为一条信息保留，不进趋势、不进摘要事实区。</p></div>${pill('不是医生结论', 'grey')}</div>
        ${state.viewpoints.map((v) => `<div class="saved-item private"><b>${esc(longDate(v.d))} · ${v.role === 'patient' ? '本人' : '照护者'}</b><p>${esc(v.text)}</p><small>这是一条看法，不是医生结论。</small></div>`).join('')}
        <div class="actions">${btn('记一句', 'add-view', 'soft')}</div>
      </div>
      <div class="card"><div class="card-head"><div><h3>什么时候值得说出来</h3><p>这不是判断标准，只是"可以提"的几个时机。</p></div></div>
        <div class="row"><div class="row-main"><div><b>持续两周以上</b><p>影响吃饭、睡觉或日常活动</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>对治疗失去兴趣</b><p>不想知道结果、不想按计划复查</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>照护者也撑不住</b><p>家属的疲惫同样值得被记下来</p></div></div></div>
        <div class="notice plain" style="margin-top:12px">是否转介心理支持、要不要用药，由治疗团队判断。工作台不评估情绪状态，也不给量表判读。</div>
      </div>
    </div>`;
}

function pageMindFertility() {
  return `${head('生育与家庭', '生育力保存只记"时间点 + 是否咨询过"；方案与判断都在生殖医学与血液科。')}
    ${subnav()}
    <div class="card">
      <div class="card-head"><div><h3>已记录的时间点</h3><p>这一项同时出现在「治疗历程」的关键节点里。</p></div>${pill('并入全程病情', 'violet')}</div>
      ${state.savings.map((s) => `<div class="row"><div class="row-main"><div><b>${esc(s.title)}</b><p>${esc(s.detail)}</p><p class="muted">${esc(longDate(s.d))}</p></div></div>${pill(s.status, 'violet')}</div>`).join('')}
      <div class="actions" style="margin-top:12px">${go('去治疗历程看这个时间点', 'treatment', '当前方案', 'soft')}</div>
    </div>
    <div class="notice warn" style="margin-top:14px">已经完成治疗的人，这个话题仍然可以问——是否有影响、是否需要进一步评估，由生殖医学与血液科一起判断。工作台不评估生育能力，也不给保存方案。</div>`;
}

/* ---------------- 照护与症状 ---------------- */
function pageCare() {
  const sub = state.sub.care || '感染与发热';
  if (sub === '症状与日常') return pageCareSymptoms();
  if (sub === '血象与支持治疗') return pageSupportBlood();
  return `${head('感染与发热', SUBTITLES.care)}
    ${subnav()}
    <div class="notice danger"><b>发热时不要等下次门诊。</b>中性粒细胞减少期间，体温 ≥38.3℃ 一次或 ≥38.0℃ 持续 1 小时，按治疗团队给的电话联系；是否去急诊由他们判断。</div>
    <div class="grid three">
      <div class="topic-card"><h3>发热与寒战</h3><p>记录体温、时间、伴随症状（咳嗽、咽痛、腹泻、皮疹）。不要自行加用退烧药掩盖体温后再观察。</p><div class="actions">${btn('记一次体温', 'add-fever', 'soft')}</div></div>
      <div class="topic-card"><h3>口腔黏膜炎</h3><p>第 3 周期后出现过 2 级，5 天缓解。记录进食受影响的程度，以及是否影响喝水。</p><div class="actions">${btn('记一次口腔情况', 'add-mucositis', 'soft')}</div></div>
      <div class="topic-card"><h3>疫苗与预防</h3><p>治疗期间与结束后一段时间内，活疫苗通常不接种；灭活疫苗的时机由医生安排。工作台不建议接种时间。</p><div class="actions">${go('写进问题', 'review', '就诊准备', 'soft')}</div></div>
    </div>
    ${section('发热记录', '')}
    <div class="card">
      <div class="row"><div class="row-main"><div><b>2026-04-26 · 38.6℃</b><p>ANC 0.8；联系团队后住院 3 天；血培养阴性</p><p class="muted">住院记录</p></div></div>${pill('3 级', 'red')}</div>
      <div class="row"><div class="row-main"><div><b>2026-09-12 · 37.4℃</b><p>咽部不适，次日缓解；未联系团队</p><p class="muted">本人记录</p></div></div>${pill('已记录', 'grey')}</div>
    </div>`;
}

function pageCareSymptoms() {
  return `${head('症状与日常', '记发生时间、程度和持续多久；分级用医生的原话，不自己改。')}
    ${subnav()}
    <div class="card">
      <div class="card-head"><div><h3>治疗期间记录到的</h3><p>按 CTCAE 分级呈现，但分级只抄医生记录里的原值。</p></div>${pill('3 条', 'violet')}</div>
      <div class="row"><div class="row-main"><div><b>手指麻木</b><p>2026-06 起，双手指尖；写字、扣扣子受影响</p><p class="muted">长春新碱相关记录 · 医生记 1 级</p></div></div>${pill('随访中', 'yellow')}</div>
      <div class="row"><div class="row-main"><div><b>乏力</b><p>第 3–5 周期明显，多在给药后 3–5 天</p><p class="muted">本人记录 · 未分级</p></div></div>${pill('已缓解', 'grey')}</div>
      <div class="row"><div class="row-main"><div><b>口腔黏膜炎</b><p>2026-05-12 起 5 天，影响进食与喝水</p><p class="muted">门诊记录 · 2 级</p></div></div>${pill('已缓解', 'grey')}</div>
      <div class="actions" style="margin-top:14px">${btn('记一条症状', 'add-mucositis', 'soft')}</div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><div class="card-head"><div><h3>日常里的几件事</h3><p>不需要都做，挑一件开始。</p></div></div>
        <div class="row"><div class="row-main"><div><b>体温</b><p>发热那几天记时间点；平时不必每天量</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>活动量</b><p>记"今天能走多久"，比记步数更贴近体力</p></div></div></div>
        <div class="row"><div class="row-main"><div><b>睡眠</b><p>入睡时间与夜间醒来次数，一条就够</p></div></div></div>
      </div>
      <div class="card"><div class="card-head"><div><h3>什么时候联系团队</h3></div></div>
        <div class="flag-list">
          <div>体温 ≥38.3℃ 一次，或 ≥38.0℃ 持续 1 小时</div>
          <div>喝水就痛、一天几乎吃不下</div>
          <div>麻木影响到走路、持物或写字</div>
          <div>新的皮疹、气短或明显心慌</div>
        </div>
        <div class="small-note" style="margin-top:10px">这份清单只帮你想起来要做的事，不是分诊规则；是否急诊由治疗团队判断。</div>
      </div>
    </div>`;
}

function pageSupportBlood() {
  return `${head('血象与支持治疗', '低谷、G-CSF 与输血记录放在一起，回答"那次为什么住院"。')}
    ${subnav()}
    <div class="metric-grid" style="margin-bottom:14px">${metricCard('anc')}${metricCard('hgb')}${metricCard('plt')}</div>
    <div class="card">
      <div class="card-head"><div><h3>支持治疗记录</h3></div></div>
      <div class="row"><div class="row-main"><div><b>G-CSF</b><p>6 个周期均使用；品种与天数见医嘱单</p></div></div>${pill('6 / 6', 'green')}</div>
      <div class="row"><div class="row-main"><div><b>红细胞输注</b><p>未输注；最低 Hb 98 g/L</p></div></div>${pill('无', 'grey')}</div>
      <div class="row"><div class="row-main"><div><b>血小板输注</b><p>未输注；最低 PLT 88 ×10⁹/L</p></div></div>${pill('无', 'grey')}</div>
      <div class="row"><div class="row-main"><div><b>住院</b><p>2026-04-26 ~ 04-29，发热性中性粒细胞减少</p></div></div>${pill('1 次', 'yellow')}</div>
    </div>
    <div class="help-box">什么时候需要输血、G-CSF 用几天，都由治疗团队按方案与当时血象决定。工作台只记录发生过什么，不给阈值。</div>`;
}

function pageReview() {
  const sub = state.sub.review || '复诊节奏';
  if (sub === '就诊准备') return pageVisitPrep();
  if (sub === '观察等待') return pageWatchWait();
  return `${head('复诊节奏', SUBTITLES.review, go('准备就诊', 'review', '就诊准备', 'primary'))}
    ${subnav()}
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><h3>当前安排</h3><p>结束治疗后的前 2 年，通常每 3 个月一次。</p></div>${pill('医生安排', 'violet')}</div>
        <div class="milestone on"><span class="dot"></span><div><b>2026-11-05 · 血液科复查</b><p>血常规、生化、LDH；是否做影像按门诊安排</p></div><small>距今 19 天</small></div>
        <div class="milestone"><span class="dot"></span><div><b>2027-02-04 · 复查（预计）</b><p>时间以医院通知为准</p></div><small>预计</small></div>
        <div class="milestone"><span class="dot"></span><div><b>2027-05-06 · 复查（预计）</b><p>—</p></div><small>预计</small></div>
        <p class="small-note">节奏因亚型、分期与治疗反应而不同；这里记录的是"医生说过什么"，不是工作台排的计划。</p>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>每次复查带什么</h3></div></div>
        <div class="flag-list">
          <div>上次的影像报告与光盘（尤其 PET-CT）</div>
          <div>最近一次血常规、生化、LDH</div>
          <div>正在服用的所有药物清单（含中药与保健品）</div>
          <div>这三个月记下的不适与体温异常</div>
          <div>想问的问题（打印或手机备忘录都行）</div>
        </div>
        <div class="actions" style="margin-top:14px">${go('生成就诊准备单', 'review', '就诊准备')}</div>
      </div>
    </div>`;
}

function pageVisitPrep() {
  const picked = state.questions.filter((q) => q.selected);
  const facts = picked.filter((q) => q.kind === 'fact');
  const views = picked.filter((q) => q.kind === 'view');
  return `${head('就诊准备', '把"想问的事"和"我的看法"分开写；医生需要的是前一类，后一类是你自己的记录。', btn('预览导出', 'export', 'primary'))}
    ${subnav()}
    <div class="card private" style="margin-bottom:14px">
      <div class="card-head"><div><h3>我的看法与担心</h3><p>只作为一条信息保留，方便你说明；不进入趋势、不写进摘要的事实区，也不参与任何判断。</p></div><span class="pill grey">不是医生结论</span></div>
      ${state.viewpoints.map((v) => `<div class="saved-item private"><b>${esc(longDate(v.d))} · ${v.role === 'patient' ? '本人' : '照护者'}</b><p>${esc(v.text)}</p><small>这是一条看法，不是医生结论。</small></div>`).join('')}
      <div class="actions">${btn('记一句我的看法', 'add-view', 'soft')}</div>
    </div>
    ${section('问题清单', `${picked.length} 条已选 · 分两类，导出时也分两区。`)}
    <div class="card">
      ${state.questions.map((q) => `<label class="row" style="align-items:flex-start;gap:12px;cursor:pointer">
        <input type="checkbox" ${q.selected ? 'checked' : ''} data-action="qsel" data-id="${q.id}" style="width:17px;height:17px;flex:0 0 17px;margin-top:4px;accent-color:var(--violet)">
        <div style="flex:1;min-width:0"><b style="font-weight:500">${esc(q.text)}</b><p class="muted">${esc(q.source)}${q.kind === 'view' ? ' · 我的看法 · 不是医生结论' : ''}</p></div>
        ${pill(q.kind === 'view' ? '我的看法' : '想问的事', q.kind === 'view' ? 'grey' : 'violet')}
      </label>`).join('')}
      <div class="actions" style="margin-top:14px">${btn('加一个问题', 'add-question', 'soft')}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><h3>导出预览</h3><p>只含选入项；顺序固定。</p></div>${pill(`${picked.length} 条`, 'violet')}</div>
      <pre style="white-space:pre-wrap;font:12px/1.7 ui-monospace,Menlo,monospace;background:#fdfcff;border:1px solid var(--line);border-radius:10px;padding:14px;margin:0;color:var(--ink-2)">${esc(markdownPreview(facts, views))}</pre>
    </div>`;
}

function markdownPreview(facts, views) {
  const lines = ['# 就诊准备 · 2026-11-05', '', '一、想问的事', ''];
  if (!facts.length) lines.push('（没有选入的问题）');
  facts.forEach((q, i) => lines.push(`${i + 1}. ${q.text}`, `   - 来源：${q.source}`));
  lines.push('', '二、我的看法与担心', '', '> 以下是我的看法与担心，**不是医生结论**。', '');
  if (!views.length) lines.push('（没有选入的看法）');
  views.forEach((v) => {
    const vp = state.viewpoints.find((x) => v.source.includes(x.d));
    lines.push(`- ${v.text}`, vp ? `  - 记录于 ${vp.d}；这是一条看法，不是医生结论` : '  - 这是一条看法，不是医生结论');
  });
  lines.push('', '三、附：关键记录', '', '- 分型：DLBCL NOS（2026-02-18 病理）', '- 末次治疗：R-CHOP 第 6 周期，2026-06-15', '- 结束 PET：2026-07-20，Deauville 2（医生记录 CR）', '- 最近血象：2026-10-09，ANC 4.4 / Hb 131 / PLT 212', '', '四、口径说明', '', '- 以上内容由本人整理，未经医生确认。', '- 工作台只整理资料，不提供诊断、治疗或用药建议。');
  return lines.join('\n');
}

function pageWatchWait() {
  const isWW = profile().ww;
  return `${head('观察等待', '惰性淋巴瘤的一种常见策略：先观察，按计划随访，不是"不治"。')}
    ${subnav()}
    <div class="ww-hero">
      <div class="big">${isWW ? '当前策略：观察等待（Watch & Wait）' : '当前画像不适用观察等待'}</div>
      <p>${isWW ? '陈女士目前没有治疗指征，医生安排每 3 个月复查一次。工作台把复查节点、症状变化与想问的问题放在一起，避免"什么都没做"被误解成"什么都没管"。' : '观察等待主要用于部分惰性淋巴瘤（如滤泡性淋巴瘤、部分 CLL/SLL）。是否适用、何时开始治疗，由医生按分期、症状、血象与病灶变化判断。'}</p>
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><div><h3>观察期记录什么</h3></div></div>
        <div class="flag-list">
          <div>淋巴结是否变大、变硬、出现新部位</div>
          <div>夜间盗汗、不明原因发热、半年内体重下降</div>
          <div>乏力程度与日常活动受影响的情况</div>
          <div>血常规变化（尤其血红蛋白、血小板、淋巴细胞）</div>
          <div>医生每次说的复查间隔</div>
        </div>
      </div>
      <div class="card"><div class="card-head"><div><h3>这段时间可以问的问题</h3></div></div>
        <div class="notice violet" style="margin:0">什么情况下需要开始治疗？下次复查做哪些检查？如果病灶变大，通常怎么判断？这些问题写进就诊准备，比在诊室里临时想更有效。</div>
        <div class="actions" style="margin-top:12px">${go('写进问题清单', 'review', '就诊准备', 'soft')}${go('切换演示画像', 'settings', '', 'soft')}</div>
      </div>
    </div>`;
}

function pageTrials() {
  const sub = state.sub.trials || '线索';
  if (sub === '已收藏') return pageTrialSaved();
  if (sub === '入组问题') return pageTrialQuestions();
  return `${head('临床试验', SUBTITLES.trials, go('入组问题', 'trials', '入组问题', 'soft'))}
    ${subnav()}
    <div class="notice warn"><b>以下为演示线索，不是推荐，也不代表已经核实的招募状态。</b>真实登记信息请以官方登记平台与研究中心为准；是否适合入组必须由研究团队评估。</div>
    ${TRIALS.map((t) => `<div class="card" style="margin-bottom:12px">
      <div class="card-head"><div><span class="eyebrow">${esc(t.nct)} · ${esc(t.phase)}</span><h3 style="margin-top:4px">${esc(t.title)}</h3><p>${esc(t.site)} · ${esc(t.fit)}</p></div>${pill(t.status, t.status === '招募中' ? 'green' : 'grey')}</div>
      <div class="actions">${btn('记下这条线索', 'save-trial', 'soft', `data-id="${t.id}"`)}${go('看入组问题', 'trials', '入组问题', 'soft')}</div>
    </div>`).join('')}
    <div class="help-box">试验线索的价值是"知道可以去问什么"，不是"找到更好的治疗"。工作台不排序、不评分、不预测获益。**药物说明、剂量与不良反应资料不在本工作台内**——这些以说明书、研究方案与医生交代为准。</div>`;
}

function pageTrialSaved() {
  return `${head('已收藏的线索', '收藏只是备忘，不代表已经联系或符合条件。')}
    ${subnav()}
    <div class="empty"><h3>还没有收藏</h3><p>在「线索」里点"收进候选"，这里会留下一条带日期的备忘。</p><div class="actions" style="justify-content:center;margin-top:12px">${go('回线索列表', 'trials', '线索', 'soft')}</div></div>`;
}

function pageTrialQuestions() {
  const qs = [
    ['我的亚型和既往治疗线符合这项研究的入组条件吗？', '入组标准通常写得很细，需要研究团队逐条核对。'],
    ['如果入组，原来的治疗计划怎么调整？', '涉及换方案、洗脱期与联合用药限制。'],
    ['需要往返几次？每次大概多久？', '距离与频率会直接影响能不能坚持。'],
    ['检查、用药与随访由谁承担费用？', '不同研究差别很大，需要书面说明。'],
    ['如果出现严重不良反应，怎么处理、找谁？', '研究团队会给出 24 小时联系方式。'],
    ['不入组的话，本院的常规选择有哪些？', '把"不进试验"也作为一个正常选项来问。']
  ];
  return `${head('入组问题', '把这些问题带去门诊，比只问"有没有新药"更有用。')}
    ${subnav()}
    <div class="card">${qs.map(([q, d], i) => `<div class="row"><div class="row-main"><div><b>${i + 1}. ${esc(q)}</b><p>${esc(d)}</p></div></div>${pill('待问', 'grey')}</div>`).join('')}</div>`;
}

/* ---------------- render ---------------- */
const RENDERERS = {
  dashboard: pageDashboard, diagnosis: pageDiagnosis, treatment: pageTreatment, labs: pageLabs,
  timeline: pageTimeline, nutrition: pageNutrition, mind: pageMind, care: pageCare,
  review: pageReview, trials: pageTrials
};

function render() {
  const page = RENDERERS[state.page] || pageDashboard;
  const p = profile();
  $('#nav').innerHTML = PAGES.map(([id, label, ic]) => `<button class="nav-button" aria-current="${state.page === id ? 'page' : 'false'}" data-action="go" data-page="${id}">${icon(ic)}<span>${label}</span></button>`).join('');
  $('#breadcrumb').textContent = PAGES.find((x) => x[0] === state.page)[1];
  $('#profile-name').textContent = `${p.name}的资料`;
  $('#profile-meta').textContent = `${p.age} 岁 · ${p.subtype}`;
  $('#profile-avatar').textContent = p.initial;
  $('#profile-btn').setAttribute('aria-label', `切换演示档案，当前为${p.name}`);
  $('#main').innerHTML = `<div class="page-enter">${page()}</div>`;
  $('#app-version').textContent = APP_INFO.displayVersion;
  $('#app-build').textContent = APP_INFO.build;
  $('#ver-chip').textContent = APP_INFO.displayVersion;
  $('#ver-chip').title = `${APP_INFO.displayVersion} · ${APP_INFO.build} · ${APP_INFO.channel}`;
  $('#ready-store').innerHTML = `<i></i><span>资料目录</span><b>已激活</b>`;
  $('#ready-session').innerHTML = `<i class="${state.session ? '' : 'grey'}"></i><span>对话</span><b>${state.session ? '进行中' : '未进入激活'}</b>`;
}

/* ---------------- actions ---------------- */
const ACTIONS = {
  go(el) {
    if (el.dataset.page === 'settings') return openSettings();
    navigate(el.dataset.page, el.dataset.sub || '');
  },
  sub(el) { navigate(state.page, el.dataset.sub); },
  range(el) { state.range = el.dataset.range; render(); },
  zoom() { /* range 由 change 事件处理，避免拖动时重渲染打断 */ },
  toggle(el) { state.toggles[el.dataset.key] = !state.toggles[el.dataset.key]; render(); },
  sel(el) {
    const c = el.dataset.code;
    if (el.checked) {
      if (state.sel.length >= 4) { el.checked = false; toast('最多同时看 4 个指标；取消一个再加。'); return; }
      state.sel.push(c);
    } else {
      if (state.sel.length === 1) { el.checked = true; toast('至少留一个指标。'); return; }
      state.sel = state.sel.filter((x) => x !== c);
    }
    render();
  },
  pin(el) { state.pin = { code: el.dataset.code, date: el.dataset.date }; render(); },
  unpin() { state.pin = null; render(); },
  flip(el) {
    const c = el.dataset.code;
    if (state.flipped.has(c)) state.flipped.delete(c); else state.flipped.add(c);
    el.setAttribute('aria-pressed', state.flipped.has(c));
  },
  qsel(el) { const q = state.questions.find((x) => x.id === el.dataset.id); if (q) { q.selected = el.checked; render(); } },
  task(el) { const t = state.tasks.find((x) => x.id === el.dataset.id); if (t) { t.done = !t.done; toast(t.done ? '已标记完成' : '已恢复为待办'); render(); } },
  src(el) { openModal('来源', `<p style="font-size:12.5px">${esc(el.dataset.src)}</p><p class="small-note">原型不打开真实文件；接入后这里会跳到该页并高亮。</p>`, '<button data-action="close">关闭</button>', '原文出处'); },
  close() { closeModal(); },
  profiles() { openProfiles(); },
  settings() { openSettings(); },
  about() { openAbout(); },
  help() { openModal('原型说明', `<div class="notice violet">这是一个<b>交互原型</b>：所有资料为模拟，状态只在内存，刷新重置；未连接 AI、DSH、真实文件或数据库。</div><p style="font-size:12.5px">可以试着：切换左侧演示画像；在「病情一图秀」改时间窗、缩放与指标；点指标卡翻面；在「就诊准备」勾选问题看导出预览；在「临床试验」收藏一条线索；在「营养支持」点体重卡翻面。</p><p class="small-note">页面 hash 可分享，例如 <code>#treatment/疗效评估</code>。</p>`, '<button data-action="close">知道了</button>', '小铃铛 · 操作说明'); },
  export() { openExport(); },
  'save-trial'() { toast('已收进候选（原型仅内存）'); },
  line(el) { state.line = Number(el.dataset.line); render(); },
  libline(el) { state.libLine = el.dataset.line; render(); },
  'add-line'() { toast('原型未接入表单；新治疗线会作为独立一组记录。'); },
  'add-opinion'() { toast('原型未接入表单；此处演示入口。'); },
  'add-cycle'() { toast('原型未接入表单；此处演示入口。'); },
  'add-question'() { openAddQuestion(); },
  'add-view'() { openAddView(); },
  'add-fever'() { toast('已记一次体温（原型仅内存）'); },
  'add-mucositis'() { toast('已记一次口腔情况（原型仅内存）'); },
  'add-meal'() { toast('已记一次进食情况（原型仅内存）'); },
  'open-store'() { openSettings(); },
  'start-session'() { state.session = state.session ? null : { id: uid('s') }; toast(state.session ? '已创建草稿会话（原型）' : '已退出会话'); render(); },
  'font-toggle'() { document.body.classList.toggle('large'); $('#font-toggle').setAttribute('aria-pressed', document.body.classList.contains('large')); }
};

function openProfiles() {
  openModal('切换演示画像', `<div class="notice plain">五套画像只改元数据与关键卡内容，指标序列仍来自 DEMO-1——界面会明写，不假装五套都有完整数据。</div>
    ${PROFILES.map((p) => `<button class="profile-row ${p.id === state.profileId ? 'on' : ''}" data-action="pick-profile" data-id="${p.id}"><div><b>${esc(p.name)} · ${p.age} 岁</b><p>${esc(p.tag)} · ${esc(p.subtype)}</p></div><span class="profile-caret">${p.id === state.profileId ? '当前' : '切换'}</span></button>`).join('')}`,
    '<button data-action="close">关闭</button>', '小铃铛 · 演示');
}
function openAbout() {
  openModal('关于小铃铛', `<div class="about">
    <img class="about-logo" src="assets/brand/lymbell-logo-full.png" alt="小铃铛 LymBell 完整标识">
    <div class="about-meta">
      <div class="about-ver"><b>${APP_INFO.displayVersion}</b>${pill('交互原型', 'violet')}</div>
      <p style="font-size:12px;margin-bottom:10px">淋巴瘤患者与照护者的病程整理工具。本原型不提供诊断、治疗或用药建议。</p>
      <dl>
        <div><dt>版本</dt><dd>${APP_INFO.displayVersion}</dd></div>
        <div><dt>构建日期</dt><dd>${APP_INFO.build}</dd></div>
        <div><dt>来源</dt><dd>仓库根 VERSION（页面与包同源）</dd></div>
        <div><dt>渲染</dt><dd>零依赖 HTML/CSS/JS，无网络请求</dd></div>
        <div><dt>渠道</dt><dd>${esc(APP_INFO.channelLabel)}</dd></div>
      </dl>
    </div>
  </div>`, '<button data-action="close">关闭</button>', '小铃铛 · 关于');
}
function openSettings() {
  const c = state.cfg;
  openModal('设置', `<div class="cfg-tabs" role="tablist">
      <button role="tab" aria-selected="true">工作区</button><button role="tab" aria-selected="false" data-action="cfg-tab">文档解析</button><button role="tab" aria-selected="false" data-action="cfg-tab">临床数据库</button>
    </div>
    <div style="margin-top:16px" class="cfg-block">
      <h3 style="font-size:13px">资料目录</h3>
      <p class="small-note">业务数据放在你选的目录里；主目录、根目录、桌面根会被拒绝。</p>
      <div class="path-row"><code>${esc(c.root)}</code><button class="soft" data-action="pick-root">更改位置</button></div>
      <div class="grid three" style="margin-top:12px">
        <div class="stat-tile"><span>原件</span><b>${c.size.doc} GB</b></div>
        <div class="stat-tile"><span>派生</span><b>${c.size.derived} GB</b></div>
        <div class="stat-tile"><span>数据库</span><b>${c.size.db} GB</b></div>
      </div>
      <p class="small-note">上次备份：${esc(c.backupAt)} · 立即备份 / 从备份恢复在原型中为入口演示。</p>
    </div>
    <div class="cfg-block" style="margin-top:12px">
      <h3 style="font-size:13px">文档解析（MinerU）</h3>
      <label class="check-row"><input type="checkbox" ${c.consent ? 'checked' : ''} data-action="consent"><span>我知道选中的文件会被上传到云端解析；不勾选不会上传。</span></label>
      <div class="token-row"><code class="masked">${esc(c.tokenMasked)}</code><button class="soft" data-action="replace-token">替换 Token</button></div>
      <p class="small-note">Token 只显示后 4 位，不回显全文；保存时先校验，失败会区分 401 / 429 / 网络错误。</p>
    </div>`, '<button class="primary" data-action="close">完成</button>', '小铃铛 · 设置');
}
function openExport() {
  const picked = state.questions.filter((q) => q.selected);
  const facts = picked.filter((q) => q.kind === 'fact');
  const views = picked.filter((q) => q.kind === 'view');
  const md = markdownPreview(facts, views);
  openModal('导出就诊准备', `<p class="small-note" style="margin-bottom:10px">只含选入的 ${picked.length} 条；两区顺序固定，看法区带声明。</p>
    <pre style="white-space:pre-wrap;font:12px/1.7 ui-monospace,Menlo,monospace;background:#fdfcff;border:1px solid var(--line);border-radius:10px;padding:14px;margin:0;color:var(--ink-2);max-height:46vh;overflow:auto">${esc(md)}</pre>`,
    '<button data-action="close">关闭</button><button class="primary" data-action="copy-md">复制 Markdown</button>', '小铃铛 · 导出');
}
function openAddQuestion() {
  openModal('加一个问题', `<label class="form-label">问题</label><input id="new-q" placeholder="例如：下次复查需要做 PET 吗？">
    <label class="form-label" style="margin-top:12px">类型</label>
    <select id="new-kind"><option value="fact">想问的事</option><option value="view">我的看法 / 担心（标注不是医生结论）</option></select>`,
    '<button data-action="close">取消</button><button class="primary" data-action="save-q">保存</button>', '小铃铛 · 问题清单');
}
function openAddView() {
  openModal('记一句我的看法', `<p class="small-note" style="margin-bottom:10px">只作为一条信息保留；不进入趋势、不写进摘要事实区，也不参与任何判断。</p>
    <textarea id="new-view" placeholder="例如：这次复查前我有点紧张，想知道如果指标有波动通常怎么处理。"></textarea>`,
    '<button data-action="close">取消</button><button class="primary" data-action="save-view">保存</button>', '小铃铛 · 我的看法');
}

/* ---------------- events ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'pick-profile') {
    state.profileId = el.dataset.id;
    closeModal();
    toast(`已切换到 ${profile().name}（演示画像）`);
    render();
    return;
  }
  if (a === 'pick-root') {
    const bad = prompt('输入资料目录的绝对路径（原型演示：输入 /Users/zhou 会被拒绝）', state.cfg.root);
    if (bad === null) return;
    if (['/', '/Users/zhou', '/Users/zhou/Desktop'].includes(bad.trim())) { toast('已拒绝：不能选主目录、根目录或桌面根'); return; }
    state.cfg.root = bad.trim();
    toast('资料目录已更新（原型仅内存）');
    openSettings();
    return;
  }
  if (a === 'consent') { state.cfg.consent = el.checked; toast(el.checked ? '已同意云端解析' : '已取消；不会上传文件'); return; }
  if (a === 'replace-token') { toast('原型不接收真实 Token；真实实现只校验不回显'); return; }
  if (a === 'cfg-tab') { toast('这个 tab 在原型里只演示入口'); return; }
  if (a === 'copy-md') {
    const picked = state.questions.filter((q) => q.selected);
    const md = markdownPreview(picked.filter((q) => q.kind === 'fact'), picked.filter((q) => q.kind === 'view'));
    navigator.clipboard?.writeText(md).then(() => toast('已复制 Markdown（若浏览器拒绝则复制失败）')).catch(() => toast('复制失败：浏览器未授权剪贴板'));
    return;
  }
  if (a === 'save-q') {
    const text = ($('#new-q')?.value || '').trim();
    if (!text) { toast('问题为空，未保存'); return; }
    state.questions.push({ id: uid('q'), text, source: '本人添加 · 2026-10-17', selected: true, kind: $('#new-kind')?.value || 'fact' });
    closeModal(); render(); toast('已加入问题清单');
    return;
  }
  if (a === 'save-view') {
    const text = ($('#new-view')?.value || '').trim();
    if (!text) { toast('内容为空，未保存'); return; }
    state.viewpoints.push({ id: uid('v'), d: '2026-10-17', text, role: 'patient' });
    closeModal(); render(); toast('已记录；这是一条看法，不是医生结论');
    return;
  }
  const fn = ACTIONS[a];
  if (fn) fn(el);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'zoom') { state.zoom = Number(el.value); render(); }
  if (a === 'sel') ACTIONS.sel(el);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#dialog').open) closeModal();
});

/* 直达 hash：#page 或 #page/sub；浏览器前进/后退与手改 hash 都会同步页面 */
function applyHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!hash) return false;
  const [p, s] = hash.split('/');
  if (!RENDERERS[p]) return false;
  state.page = p;
  if (s) state.sub[p] = s;
  return true;
}

(function boot() {
  $('#font-toggle').addEventListener('click', () => ACTIONS['font-toggle']());
  applyHash();
  render();
})();

window.addEventListener('hashchange', () => {
  if (!applyHash()) return;
  render();
  $('#main').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
});
