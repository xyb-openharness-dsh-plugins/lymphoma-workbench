/**
 * 报告导入与草稿核对（M2 第二段）。
 *
 * 移植自乳腺癌工作台的 ImportService，表名换成 import_file（0001 的 document 是
 * 人工归档的资料清单，两者分工不同）。四条不能省的规矩：
 * 1. **原件去重靠 sha256**：同一档案同一哈希只建一条 import_file，重复导入返回
 *    原记录与首次导入时间，**不重置**解析状态；
 * 2. **解析失败不产生候选**：`import_file.status='parse_failed'` 时 addCandidate 直接拒绝，
 *    原件仍在列表里，可重试（A2）；
 * 3. **候选是待核对项，不是事实**：candidate 只在用户接受后写 metric_point，
 *    接受只表示"录入"，不表示临床审核；
 * 4. **候选去重靠 UNIQUE(import_id, field, value_text)**：同原件同字段同值合并，不产生两条。
 *
 * 另一条边界：候选不写 viewpoint——看法是用户的话，不是从报告里提的。
 */
import { randomUUID } from 'node:crypto'
import { MineruClient } from './mineru.js'
import { extractCandidates } from './labparse.js'

const nowIso = () => new Date().toISOString()
const newId = (prefix) => `${prefix}_${randomUUID()}`

/** 已实现入库映射的字段命名空间；其他（病理/影像结论）只抄写为候选展示，不入指标。 */
export const SUPPORTED_NAMESPACES = ['metric']

export const CANDIDATE_ACTIONS = ['accept', 'reject']

export class ImportError extends Error {
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ImportError'
    this.code = code
    this.detail = detail
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 真日期（能排除 2026-02-31 这种"格式对、日子不对"）。 */
function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * 医疗事件日期校验。上限是"今天"（不接受未来日期），下限 1940-01-01。
 * 只做**常识边界**，不做"与出生年份比对"——档案可能没填出生年，不能凭空推断。
 */
export function assertMedicalDate(value, label = '日期', today = () => new Date().toISOString().slice(0, 10)) {
  if (!isRealDate(value)) {
    throw new ImportError('BAD_DATE', `${label}必须是 YYYY-MM-DD 的真实日期，收到：${value ?? '(空)'}`)
  }
  if (value > today()) throw new ImportError('FUTURE_DATE', `${label}不能晚于今天（${today()}），收到：${value}`)
  if (value < '1940-01-01') throw new ImportError('IMPLAUSIBLE_DATE', `${label}早于 1940-01-01，请核对：${value}`)
  return value
}

function parseField(field, db) {
  if (typeof field !== 'string' || !field.includes(':')) {
    throw new ImportError('BAD_FIELD', `字段名要写成 <命名空间>:<键>，例如 metric:ldh，收到：${field ?? '(空)'}`)
  }
  const index = field.indexOf(':')
  const namespace = field.slice(0, index)
  const key = field.slice(index + 1)
  if (!key) throw new ImportError('BAD_FIELD', `字段缺少键名：${field}`)
  if (!SUPPORTED_NAMESPACES.includes(namespace)) {
    throw new ImportError(
      'UNSUPPORTED_FIELD',
      `字段命名空间「${namespace}」还没有入库映射（当前支持：${SUPPORTED_NAMESPACES.join(' / ')}）`,
      { field },
    )
  }
  if (namespace === 'metric' && !db.prepare('SELECT code FROM metric_def WHERE code = ?').get(key)) {
    throw new ImportError('UNKNOWN_METRIC', `指标「${key}」不在字典里，无法入库`, { field })
  }
  return { namespace, key }
}

/** 原件相对路径：不许绝对路径、不许 .. 上跳（原件必须留在工作区目录内）。 */
function assertSafeStoragePath(storagePath) {
  if (typeof storagePath !== 'string' || !storagePath.trim()) {
    throw new ImportError('UNSAFE_PATH', '原件路径不能为空')
  }
  if (storagePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(storagePath)) {
    throw new ImportError('UNSAFE_PATH', `原件路径必须是工作区内的相对路径，收到绝对路径：${storagePath}`)
  }
  if (storagePath.split(/[\\/]/).includes('..')) {
    throw new ImportError('UNSAFE_PATH', `原件路径不能跳出工作区：${storagePath}`)
  }
}

/** 小事务封装：node:sqlite 没有自动事务，出错必须回滚，不留半份数据。 */
function withTransaction(db, fn) {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* 已经回滚就不再掩盖真正的错误 */ }
    throw error
  }
}

export class ImportService {
  /**
   * @param {object} store createStore 的返回值（只用 db 与 today）
   * @param {object} [opts] today 注入（单测）；maxBytes 上传上限
   */
  constructor(store, { today = () => new Date().toISOString().slice(0, 10), maxBytes = 20 * 1024 * 1024 } = {}) {
    this.store = store
    this.db = store.db
    this.today = today
    this.maxBytes = maxBytes
  }

  /* ---------- ① 导入原件 ---------- */

  /**
   * 登记一份原件（文件落盘由 server 负责，这里只管库）。
   * 同一档案同一 sha256 → 返回已存在的记录，`duplicate: true`，
   * **不改**它的状态、不新建 parse_job（重复导入不该让已解析的材料退回未解析）。
   */
  importFile({ profileId, filename, sha256, storagePath, mime = null, bytes = null, reportDate = null }) {
    if (!profileId) throw new ImportError('NO_PROFILE', '导入必须指定所属档案')
    const profile = this.db.prepare('SELECT id FROM profile WHERE id = ?').get(profileId)
    if (!profile) throw new ImportError('NO_PROFILE', `档案不存在：${profileId}`)
    if (!filename?.trim()) throw new ImportError('BAD_FILENAME', '文件名不能为空')
    if (!SHA256_RE.test(String(sha256 ?? ''))) {
      throw new ImportError('BAD_HASH', 'sha256 必须是 64 位小写十六进制（用它判重，不能留空）')
    }
    assertSafeStoragePath(storagePath)
    // 报告日期可空（不是每份原件都写得清），但给了就必须是真实且不晚于今天。
    if (reportDate !== null) assertMedicalDate(reportDate, '报告/采样日期', this.today)

    const existing = this.db
      .prepare('SELECT * FROM import_file WHERE profile_id = ? AND sha256 = ?')
      .get(profileId, sha256)
    if (existing) {
      // 重复导入不改状态；只有在原来没日期、这次带了日期时补一次（补日期不会让事实失真）。
      if (reportDate && !existing.report_date) {
        this.db.prepare('UPDATE import_file SET report_date = ? WHERE id = ?').run(reportDate, existing.id)
        return {
          file: this.db.prepare('SELECT * FROM import_file WHERE id = ?').get(existing.id),
          duplicate: true,
          importedAt: existing.imported_at,
          dateBackfilled: true,
        }
      }
      return { file: existing, duplicate: true, importedAt: existing.imported_at, dateBackfilled: false }
    }

    const id = newId('imp')
    this.db.prepare(`INSERT INTO import_file
      (id, profile_id, filename, mime, bytes, sha256, storage_path, status, imported_at, report_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'stored', ?, ?)`)
      .run(id, profileId, filename.trim(), mime, bytes, sha256, storagePath, nowIso(), reportDate)
    return { file: this.#file(id), duplicate: false, importedAt: nowIso(), dateBackfilled: false }
  }

  filesFor(profileId) {
    return this.db.prepare('SELECT * FROM import_file WHERE profile_id = ? ORDER BY imported_at DESC').all(profileId)
  }

  /* ---------- ② 解析（可失败） ---------- */

  /** 排队并立即进入 running（本地同步解析，没有真正的队列，但状态机照建）。 */
  startParse(importId, { engine = null } = {}) {
    const file = this.#file(importId)
    if (file.status === 'parsed') {
      throw new ImportError('ALREADY_PARSED', '这份材料已解析成功，不需要重复解析；要重来请先重新导入并核对')
    }
    const running = this.db
      .prepare("SELECT * FROM parse_job WHERE import_id = ? AND status IN ('queued','running')")
      .get(importId)
    if (running) return running

    const id = newId('pj')
    this.db.prepare(`INSERT INTO parse_job (id, import_id, status, engine, started_at)
      VALUES (?, ?, 'running', ?, ?)`).run(id, importId, engine, nowIso())
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(id)
  }

  finishParse(jobId, { engine = null } = {}) {
    const job = this.#job(jobId)
    if (job.status !== 'running' && job.status !== 'queued') {
      throw new ImportError('JOB_CLOSED', `解析任务已是 ${job.status}，不能再置为成功`)
    }
    withTransaction(this.db, () => {
      this.db.prepare("UPDATE parse_job SET status='succeeded', finished_at=?, engine=COALESCE(?, engine) WHERE id=?")
        .run(nowIso(), engine, jobId)
      this.db.prepare("UPDATE import_file SET status='parsed', parsed_at=? WHERE id=?").run(nowIso(), job.import_id)
    })
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(jobId)
  }

  /** 失败：任务留在列表里带原因，原件保留，**不产生任何候选**。 */
  failParse(jobId, { errorCode = 'parse_error', errorText = null } = {}) {
    const job = this.#job(jobId)
    if (job.status !== 'running' && job.status !== 'queued') {
      throw new ImportError('JOB_CLOSED', `解析任务已是 ${job.status}，不能再置为失败`)
    }
    withTransaction(this.db, () => {
      this.db.prepare(`UPDATE parse_job SET status='failed', finished_at=?, error_code=?, error_text=? WHERE id=?`)
        .run(nowIso(), errorCode, errorText, jobId)
      this.db.prepare("UPDATE import_file SET status='parse_failed' WHERE id=?").run(job.import_id)
    })
    return this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(jobId)
  }

  jobsFor(importId) {
    return this.db.prepare('SELECT * FROM parse_job WHERE import_id = ? ORDER BY started_at DESC').all(importId)
  }

  /**
   * 走 MinerU 解析一份已导入的原件：申请上传 → 上传 → 轮询 → 取 `full.md` → 生成候选。
   *
   * 事务边界：候选写入、`import_file` 置 `parsed`、`parse_job` 置 `succeeded` 在同一次提交里；
   * 任何一步抛错都整体回滚并走 `failParse`——**不留下半份候选**，也**不让失败的原件变成已解析**（A2）。
   *
   * @param {object} opts
   * @param {string} opts.importId
   * @param {Buffer|Uint8Array} opts.bytes 原件字节（读文件由调用方负责）
   * @param {string} [opts.filename] 不给就用已登记的 filename
   * @param {MineruClient} [opts.client] 注入客户端（单测用假 fetch，不联网）
   * @param {object} [opts.options] 透传给 MinerU 的解析参数（语言、轮询间隔等）
   */
  async parseWithMineru({ importId, bytes, filename = null, client = null, token = null, options = {} }) {
    const file = this.#file(importId)
    const job = this.startParse(importId, { engine: 'mineru' })
    try {
      const mineru = client ?? new MineruClient({ token })
      const result = await mineru.parse({
        bytes,
        filename: filename ?? file.filename,
        dataId: file.id,
        ...options,
      })
      const extracted = extractCandidates({ markdown: result.markdown, contentList: result.contentList })

      const inserted = withTransaction(this.db, () => {
        // finishParse 自带事务，这里已在事务内：直接写状态，避免嵌套 BEGIN
        this.db.prepare("UPDATE parse_job SET status='succeeded', finished_at=?, engine=COALESCE(?, engine) WHERE id=?")
          .run(nowIso(), 'mineru', job.id)
        this.db.prepare("UPDATE import_file SET status='parsed', parsed_at=? WHERE id=?").run(nowIso(), importId)
        if (extracted.reportDate && !file.report_date) {
          this.db.prepare('UPDATE import_file SET report_date = ? WHERE id = ?').run(extracted.reportDate, importId)
        }
        if (result.pages) {
          this.db.prepare('UPDATE import_file SET page_count = ? WHERE id = ?').run(result.pages, importId)
        }
        let count = 0
        for (const item of extracted.items) {
          const { merged } = this.addCandidate({
            importId,
            field: item.field,
            valueText: item.valueText,
            valueNum: item.valueNum,
            unit: item.unit,
            method: item.method,
            pageRef: item.pageRef,
            confidence: item.confidence,
            occurredOn: extracted.reportDate,
          })
          if (!merged) count += 1
        }
        return count
      })

      return {
        job: this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(job.id),
        file: this.#file(importId),
        batchId: result.batchId,
        pages: result.pages ?? null,
        reportDate: extracted.reportDate,
        inserted,
        warnings: extracted.warnings,
      }
    } catch (error) {
      try {
        this.failParse(job.id, {
          errorCode: error.code ?? 'parse_error',
          errorText: error.message,
        })
      } catch {
        /* 任务已被并发关闭时保持原状，不掩盖真正的解析错误 */
      }
      throw error
    }
  }

  /* ---------- ③ 生成候选 ---------- */

  /**
   * 新增一个待核对候选。`value_text` 是原文抄下来的字面值（必须有），
   * `value_num` 是解析出的数（有就存，没有就留给用户核对时补）。
   * `occurred_on` 是这条候选所属医疗事件的日期；解析器读得到就带上，读不到留空（核对时再问）。
   */
  addCandidate({
    importId, field, valueText = null, valueNum = null, unit = null,
    method = null, pageRef = null, confidence = null, occurredOn = null,
  }) {
    parseField(field, this.db)
    if (!importId) {
      throw new ImportError(
        'NO_IMPORT',
        '候选必须挂在某份原件下：candidate 表没有 profile_id，脱离材料就无法判定属于谁（手工补录请直接写事实层）',
      )
    }
    const file = this.#file(importId)
    if (file.status !== 'parsed') {
      throw new ImportError('PARSE_REQUIRED', `原件当前是 ${file.status}，解析成功后才能生成候选（A2）`, { importId })
    }
    const text = valueText === null || valueText === undefined ? '' : String(valueText).trim()
    if (!text) throw new ImportError('EMPTY_VALUE', '候选必须带原文值（valueText），不能只留数字')
    if (occurredOn !== null) assertMedicalDate(occurredOn, '候选的医疗事件日期', this.today)

    const dup = this.db
      .prepare('SELECT * FROM candidate WHERE import_id = ? AND field = ? AND value_text = ?')
      .get(importId, field, text)
    if (dup) return { candidate: dup, merged: true }

    const id = newId('cand')
    this.db.prepare(`INSERT INTO candidate
      (id, import_id, field, value_text, value_num, unit, method, page_ref, confidence, status, occurred_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .run(id, importId, field, text, valueNum, unit, method, pageRef, confidence, occurredOn)
    return { candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(id), merged: false }
  }

  candidatesFor(importId) {
    return this.db.prepare('SELECT * FROM candidate WHERE import_id = ? ORDER BY field, value_text').all(importId)
  }

  /* ---------- ④ 草稿视图（读取时算，不落库） ---------- */

  /**
   * 待核对草稿：按原件分组，附带**读取时计算的**问题清单。
   * 问题不写进库：规则改了，历史候选的判定应跟着改，而不是留着旧结论。
   */
  draftFor(profileId) {
    const files = this.filesFor(profileId)
    const ids = files.map((f) => f.id)
    const placeholders = ids.length ? ids.map(() => '?').join(',') : "''"
    const rows = ids.length
      ? this.db.prepare(`SELECT * FROM candidate WHERE import_id IN (${placeholders})
          ORDER BY field, value_text`).all(...ids)
      : []

    const conflictKeys = new Set()
    const group = new Map()
    for (const c of rows) {
      if (!group.has(c.field)) group.set(c.field, new Set())
      group.get(c.field).add(c.value_text)
    }
    for (const [field, values] of group) if (values.size > 1) conflictKeys.add(field)

    const withIssues = (c, file) => {
      const issues = this.#issues(c, conflictKeys.has(c.field))
      return {
        candidate: c,
        fileName: file?.filename ?? null,
        // 建议日期：候选自带 > 材料报告日期 > 空（界面这时必须让用户填，不许拿导入时间顶）
        suggestedDate: c.occurred_on ?? file?.report_date ?? null,
        issues,
        canAutoAccept: issues.length === 0,
      }
    }

    const byFile = files.map((file) => {
      const list = rows.filter((c) => c.import_id === file.id).map((c) => withIssues(c, file))
      return {
        file,
        reportDate: file.report_date ?? null,
        jobs: this.jobsFor(file.id),
        candidates: list,
        counts: countByStatus(list),
      }
    })

    const all = rows.map((c) => withIssues(c, files.find((f) => f.id === c.import_id)))
    return { files: byFile, counts: countByStatus(all) }
  }

  /** 单条候选的问题（只报"需要人看一眼"的，不把正常值也列成问题）。 */
  #issues(c, conflict = false) {
    const issues = []
    const { namespace, key } = parseField(c.field, this.db)
    if (namespace === 'metric') {
      const def = this.db.prepare('SELECT code, name, unit FROM metric_def WHERE code = ?').get(key)
      if (def?.unit && !c.unit) {
        issues.push({ code: 'unit_missing', text: `缺单位（字典口径：${def.unit}）` })
      }
      if (c.value_num === null && !Number.isFinite(Number(c.value_text))) {
        issues.push({ code: 'value_not_number', text: `「${c.value_text}」不是数字，需手工确认` })
      }
    }
    if (conflict) {
      issues.push({ code: 'conflict', text: '同一份材料里这个字段有多个不同值，需你判断哪个对' })
    }
    if (c.confidence !== null && c.confidence < 0.6) {
      issues.push({ code: 'low_confidence', text: `解析把握度低（${Math.round(c.confidence * 100)}%），建议对照原文` })
    }
    return issues
  }

  /* ---------- ⑤ 逐项核对 → 写事实层 ---------- */

  /**
   * 决定一条候选。accept 会把事实写进 metric_point 并回填 record_id；reject 只改状态。
   *
   * 日期优先级：本次显式传入 > 候选自带（解析时从原件读到的） > 报错。
   * 这里**不猜**——报告日期、采样日期不是一回事；`imported_at` 永不顶替。
   */
  decideCandidate({ candidateId, action, occurredOn = null }) {
    if (!CANDIDATE_ACTIONS.includes(action)) {
      throw new ImportError('BAD_ACTION', `动作只能是：${CANDIDATE_ACTIONS.join(' / ')}`)
    }
    const c = this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId)
    if (!c) throw new ImportError('NO_CANDIDATE', `候选不存在：${candidateId}`)
    if (c.status !== 'pending') {
      throw new ImportError('TERMINAL', `这条候选已经是 ${c.status}，不能重复决定`, { candidateId })
    }

    if (action === 'reject') {
      this.db.prepare("UPDATE candidate SET status = 'rejected', decided_at = ? WHERE id = ?").run(nowIso(), candidateId)
      return { candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId), fact: null }
    }

    const resolvedDate = occurredOn ?? c.occurred_on ?? null
    if (!resolvedDate) {
      throw new ImportError(
        'DATE_REQUIRED',
        '这条记录缺「发生日期」：原件里没读到、候选上也没有。请填一次——不要用导入时间顶替（两者不是一回事）',
        { candidateId },
      )
    }
    const date = assertMedicalDate(resolvedDate, '这次记录的发生日期', this.today)

    const { key } = parseField(c.field, this.db)
    const file = this.#file(c.import_id)
    const def = this.db.prepare('SELECT code, unit FROM metric_def WHERE code = ?').get(key)

    return withTransaction(this.db, () => {
      const valueNum = c.value_num ?? (Number.isFinite(Number(c.value_text)) ? Number(c.value_text) : null)
      const info = this.db.prepare(`INSERT INTO metric_point
        (profile_id, code, measured_on, value_num, value_text, source_text, method)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(file.profile_id, key, date, valueNum, c.value_text,
          `报告抄写：${file.filename}${c.page_ref ? ` · ${c.page_ref}` : ''}`, c.method)
      const fact = this.db.prepare('SELECT * FROM metric_point WHERE id = ?').get(info.lastInsertRowid)

      this.db.prepare(`UPDATE candidate SET status = 'accepted', decided_at = ?, record_id = ? WHERE id = ?`)
        .run(nowIso(), fact.id, candidateId)

      return {
        candidate: this.db.prepare('SELECT * FROM candidate WHERE id = ?').get(candidateId),
        fact,
      }
    })
  }

  /**
   * 一份材料一次收下（化验单通常整页同一个采样日期）。
   * 日期优先级：候选自带 > 本次传入 > 材料的报告日期；三者都没有就**不猜**，
   * 该条留在 pending 并在 `skipped` 里报 `date_missing`。
   * 有问题的候选同样**不静默跳过**：留下并回传原因，等单条核对。
   */
  acceptFileCandidates({ importId, occurredOn = null }) {
    if (occurredOn !== null) assertMedicalDate(occurredOn, '这次记录的发生日期', this.today)
    const file = this.#file(importId)

    const accepted = []
    const skipped = []
    for (const c of this.candidatesFor(importId)) {
      if (c.status !== 'pending') continue
      const { key } = parseField(c.field, this.db)
      const def = this.db.prepare('SELECT unit FROM metric_def WHERE code = ?').get(key)
      const issues = this.#issues(c, false)
      if (issues.length > 0) {
        skipped.push({ candidateId: c.id, field: c.field, reasons: issues.map((i) => i.code) })
        continue
      }
      const date = c.occurred_on ?? occurredOn ?? file.report_date ?? null
      if (!date) {
        skipped.push({ candidateId: c.id, field: c.field, reasons: ['date_missing'] })
        continue
      }
      if (def?.unit && !c.unit) { // 双保险：单位缺失在单条核对里补
        skipped.push({ candidateId: c.id, field: c.field, reasons: ['unit_missing'] })
        continue
      }
      accepted.push(this.decideCandidate({ candidateId: c.id, action: 'accept', occurredOn: date }).fact)
    }
    return { accepted, skipped }
  }

  #file(id) {
    const file = this.db.prepare('SELECT * FROM import_file WHERE id = ?').get(id)
    if (!file) throw new ImportError('NO_IMPORT', `原件不存在：${id}`)
    return file
  }

  #job(id) {
    const job = this.db.prepare('SELECT * FROM parse_job WHERE id = ?').get(id)
    if (!job) throw new ImportError('NO_JOB', `解析任务不存在：${id}`)
    return job
  }
}

function countByStatus(list) {
  const counts = { pending: 0, accepted: 0, rejected: 0 }
  for (const item of list) {
    const status = item.candidate ? item.candidate.status : item.status
    if (status in counts) counts[status] += 1
  }
  return counts
}

export function createImportService(store, opts = {}) {
  return new ImportService(store, opts)
}
