/** F3B：旧状态的显式同事务接入；不扫描目录，不运行调度或发送消息。 */
'use strict'
const { createHash } = require('node:crypto')
const { 取内部 } = require('./sqlite-context.cjs')
const { 内部状态操作, 纯数据 } = require('./sqlite-state.cjs')
const { 校验迁移日记 } = require('./sqlite-diary.cjs')
const { 创建影子档案, 创建样本库 } = require('./sqlite-fixture.cjs')
const { 识别来源 } = require('./sqlite-sources.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 校验后台缓冲 } = require('../core/后台缓冲格式.cjs')
const 哈希 = (s) => createHash('sha256').update(s).digest('hex')
const 评估状态 = ['已生成','已存在','已删除','无可用同日对话','没有微妙情绪波动','失败待重试']
function 失败(码) { throw Error('SQLITE_BACKUP_IMPORT_' + 码) }
function 精确(x, keys) { if (!x || Object.getPrototypeOf(x) !== Object.prototype || Object.keys(x).length !== keys.length || Object.keys(x).some((k) => !keys.includes(k))) 失败('INPUT_INVALID') }
function 日期(x) { if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\d$/u.test(x) || !Number.isFinite(Date.parse(x+'T00:00:00Z')) || new Date(x+'T00:00:00Z').toISOString().slice(0,10) !== x) 失败('DATE_INVALID') }
function 核验旧状态绑定(db) {
  const r = db.prepare("SELECT value FROM repository_meta WHERE key='state_import_manifest'").get(), h = db.prepare("SELECT value FROM repository_meta WHERE key='state_import_manifest_hash'").get()
  if (!r) { if (h) 失败('INTEGRITY_FAILED'); return }
  if (!h || 哈希(r.value) !== h.value) 失败('INTEGRITY_FAILED')
  const x = JSON.parse(r.value); 精确(x, ['版本','来源指纹','目标']); if (x.版本 !== 1 || !/^[a-f0-9]{64}$/u.test(x.来源指纹) || !Array.isArray(x.目标)) 失败('INTEGRITY_FAILED')
  for (const t of x.目标) {
    if (t.去向 === 'state') { if (!db.prepare('SELECT 1 FROM state_documents WHERE document_id=? AND kind=?').get(t.编号, t.业务类型)) 失败('INTEGRITY_FAILED') }
    else if (t.去向 === 'diary') {
      const n = db.prepare('SELECT 1 FROM diary_entries WHERE visibility=? AND diary_id=? AND diary_type=? AND period=?').all(t.可见性,t.编号,t.类型,t.周期).length + db.prepare('SELECT 1 FROM diary_deleted WHERE visibility=? AND diary_id=? AND diary_type=? AND period=?').all(t.可见性,t.编号,t.类型,t.周期).length
      if (n !== 1) 失败('INTEGRITY_FAILED')
    } else if (t.去向 === 'private-evaluation') { if (!db.prepare('SELECT 1 FROM diary_private_evaluations WHERE period=?').get(t.周期)) 失败('INTEGRITY_FAILED') }
    else 失败('INTEGRITY_FAILED')
  }
}
function 准备旧状态(上下文, 原) {
  const 本机 = 取内部(上下文).本机, 包 = 纯数据(原); 精确(包, ['版本','用途','文档'])
  if (包.版本 !== 1 || 包.用途 !== (本机 ? 'local-state-import' : 'synthetic-state-import') || !Array.isArray(包.文档) || !包.文档.length) 失败('SCOPE_REQUIRED')
  const 已见 = new Set(), docs = 包.文档.map((d) => {
    精确(d, ['路径','类型','原文']); const s = 识别来源(d.路径)
    if (!['state','diary','private-evaluations','private-deletions'].includes(s.去向) || d.类型 !== s.类型 || typeof d.原文 !== 'string' || 已见.has(d.路径)) 失败('SOURCE_UNMAPPED')
    已见.add(d.路径); return { ...d, s }
  }).sort((a,b) => a.路径 < b.路径 ? -1 : 1)
  const 档 = 本机 ? 创建影子档案({ 用途: 'local-readonly-shadow', 包含私密: true }) : 创建样本库()
  try { 档.导入({ 版本: 1, 用途: 本机 ? 'local-readonly-shadow' : 'synthetic-sqlite-fixture', 文档: docs.map((d) => ({ 名称: 'state-'+哈希(d.路径), 类型: d.类型, 原文: d.原文 })) }) } finally { 档.关闭() }
  for (const d of docs) {
    d.值 = d.类型 === 'usage' ? d.原文.split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s)) : JSON.parse(d.原文.replace(/^\uFEFF/u,''))
    if (d.类型 === 'channel-map') 校验渠道映射存档(JSON.parse(d.原文))
    if (d.类型 === 'channel-tasks') 校验渠道任务存档(JSON.parse(d.原文), d.值.端点)
    if (d.类型 === 'extraction-buffer') 校验后台缓冲(JSON.parse(d.原文))
  }
  const 指纹 = 哈希(JSON.stringify(docs.map(({路径,类型,原文}) => ({路径,类型,原文})))), 状态 = 内部状态操作(上下文)
  return { 文档: docs.map(({路径,类型,原文}) => ({路径,类型,原文})), 应用(db) {
    核验旧状态绑定(db)
    const 旧 = db.prepare("SELECT value FROM repository_meta WHERE key='state_import_manifest'").get()
    if (旧) { if (JSON.parse(旧.value).来源指纹 !== 指纹) 失败('CONFLICT'); return { 好: true, 新导入: false } }
    for (const t of ['state_documents','state_anchors','state_items','diary_entries','diary_deleted','diary_private_evaluations']) if (db.prepare(`SELECT 1 FROM ${t}`).get()) 失败('NOT_EMPTY')
    const 目标 = [], 加墓碑 = (vis, type, period, id, time) => {
      const raw = JSON.stringify({ 格式版本: 1, 编号: id, 类型: type, 周期: period, 可见性: vis })
      db.prepare('INSERT INTO diary_deleted VALUES(?,?,?,?,?,?,?)').run(vis,type,period,id,time,raw,哈希(raw)); 目标.push({ 去向: 'diary', 可见性: vis, 类型: type, 周期: period, 编号: id })
    }
    for (const d of docs.filter((d) => d.s.去向 === 'state')) {
      状态.写(db, d.s.业务类型, d.s.号, d.值, 0); 目标.push({ 去向:'state', 编号:d.s.业务类型+':'+d.s.号, 业务类型:d.s.业务类型 })
      if (d.类型 === 'diary-index') for (const t of d.值.任务.filter((t) => t.状态 === '已删除')) {
        if (!['日','周'].includes(t.类型) || typeof t.周期 !== 'string' || typeof t.编号 !== 'string' || (t.删除于 !== undefined && typeof t.删除于 !== 'string')) 失败('DELETION_INVALID')
        加墓碑('shared',t.类型,t.周期,t.编号,t.删除于 ?? '')
      }
    }
    const evalDoc = docs.find((d) => d.s.去向 === 'private-evaluations'), delDoc = docs.find((d) => d.s.去向 === 'private-deletions')
    if (evalDoc) {
      精确(evalDoc.值,['格式版本','任务'])
      for (const e of evalDoc.值.任务) {
        日期(e.周期)
        if (Object.keys(e).some((k) => !['周期','状态','更新于','尝试次数','下次尝试'].includes(k)) || !评估状态.includes(e.状态) || ['更新于','下次尝试'].some((k) => Object.hasOwn(e,k) && (typeof e[k] !== 'string' || (e[k] && !Number.isFinite(Date.parse(e[k]))))) || (e.尝试次数 !== undefined && (!Number.isInteger(e.尝试次数) || e.尝试次数 < 0 || e.尝试次数 > 100))) 失败('EVALUATION_INVALID')
        const raw = JSON.stringify(e); db.prepare('INSERT INTO diary_private_evaluations VALUES(?,?,?,?)').run(e.周期,1,raw,哈希(raw)); 目标.push({ 去向:'private-evaluation', 周期:e.周期 })
      }
    }
    if (delDoc) {
      精确(delDoc.值,['格式版本','周期'])
      for (const p of delDoc.值.周期) { 日期(p); const e = evalDoc?.值.任务.find((e) => e.周期 === p); if (!e || e.状态 !== '已删除') 失败('DELETION_INVALID'); 加墓碑('private','日',p,'私密日:'+p,e.更新于 ?? '') }
    }
    for (const d of docs.filter((d) => d.s.去向 === 'diary')) {
      const x = 校验迁移日记(d.值, d.s.可见性)
      if (x.类型 !== d.s.日记类型 || x.周期 !== d.s.周期) 失败('DIARY_PATH_MISMATCH')
      const raw = JSON.stringify(x); db.prepare('INSERT INTO diary_entries VALUES(?,?,?,?,?,?,?)').run(d.s.可见性,x.编号,x.类型,x.周期,1,raw,哈希(raw))
      目标.push({ 去向:'diary', 可见性:d.s.可见性, 类型:x.类型, 周期:x.周期, 编号:x.编号 })
    }
    const idx = docs.find((d) => d.类型 === 'diary-index')
    for (const t of idx?.值.任务 || []) if (t.状态 === '已完成' && !db.prepare("SELECT 1 FROM diary_entries WHERE visibility='shared' AND diary_id=?").get(t.编号)) 失败('INDEX_INCONSISTENT')
    for (const d of docs.filter((d) => d.类型 === 'channel-tasks')) {
      const map = docs.find((m) => m.类型 === 'channel-map' && m.s.号 === d.s.号)
      for (const t of d.值.记录) if (!map?.值.记录.some((m) => m.内部对话编号 === t.内部对话编号 && m.端点.渠道 === t.来源.端点.渠道 && m.端点.账号 === t.来源.端点.账号 && m.会话.类型 === t.来源.会话.类型 && m.会话.编号 === t.来源.会话.编号 && m.发送者编号 === t.来源.发送者编号)) 失败('CHANNEL_MAP_MISSING')
    }
    const manifest = JSON.stringify({ 版本:1, 来源指纹:指纹, 目标 })
    db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('state_import_manifest',manifest)
    db.prepare('INSERT INTO repository_meta VALUES(?,?)').run('state_import_manifest_hash',哈希(manifest))
    return { 好:true, 新导入:true, 文档数:docs.length }
  } }
}
module.exports = { 准备旧状态, 核验旧状态绑定 }
