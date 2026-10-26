/** S-15E：隔离仓储组合、同事务逻辑快照和原格式反导出；无正式目录/网络入口。 */
'use strict'
const { createHash } = require('node:crypto')
const { 创建内存上下文, 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 创建会话仓储 } = require('./sqlite-chat.cjs')
const { 创建记忆仓储 } = require('./sqlite-memory.cjs')
const { 创建状态仓储, 纯数据 } = require('./sqlite-state.cjs')
const { 创建日记仓储 } = require('./sqlite-diary.cjs')
const { 创建样本库 } = require('./sqlite-fixture.cjs')
const { 创建旧格式仓储, 旧格式范围 } = require('./sqlite-legacy.cjs')
const { 校验渠道映射存档 } = require('../脑/渠道会话映射.cjs')
const { 校验渠道任务存档 } = require('../脑/渠道任务调度.cjs')
const { 校验后台缓冲 } = require('../core/后台缓冲格式.cjs')
const 范围 = Object.freeze({ 用途: 'local-migration-backup', 包含私密: true })
const 哈希 = (值) => createHash('sha256').update(值).digest('hex')
const 摘要 = (值) => 哈希(JSON.stringify(值))
const 克隆 = (值) => JSON.parse(JSON.stringify(值))
const 排 = (a, b) => a < b ? -1 : a > b ? 1 : 0
const 是时间 = (值) => typeof 值 === 'string' && Number.isFinite(Date.parse(值)) && new Date(值).toISOString() === 值
function 失败(码) { throw new Error('SQLITE_BACKUP_' + 码) }
function 授权(值) {
  const 一 = 纯数据(值)
  if (Object.keys(一).length !== 2 || 一.用途 !== 范围.用途 || 一.包含私密 !== true) 失败('SCOPE_REQUIRED')
}
function 相等(a, b) {
  const 稳定 = (一) => Array.isArray(一) ? 一.map(稳定) : 一 && typeof 一 === 'object' ? Object.fromEntries(Object.keys(一).sort().map((k) => [k, 稳定(一[k])])) : 一
  return JSON.stringify(稳定(a)) === JSON.stringify(稳定(b))
}
function 相对路径(值) {
  if (typeof 值 !== 'string' || 值.length > 240 || !值 || 值.includes('\\')) 失败('PATH_INVALID')
  for (const 段 of 值.split('/')) {
    if (!段 || 段 === '.' || 段 === '..' || /[\x00-\x1f<>:"|?*]/u.test(段) || /[.\s]$/u.test(段)
      || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(段)) 失败('PATH_INVALID')
  }
  return 值
}
function 原文值(一) {
  const 文 = 一.原文.replace(/^\uFEFF/u, '')
  return ['messages', 'usage'].includes(一.类型) ? 文.split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x)) : JSON.parse(文)
}
function 文档(路径, 类型, 值) {
  相对路径(路径)
  return { 名称: 'doc-' + 哈希(路径).slice(0, 32), 类型, 路径, 原文: ['messages', 'usage'].includes(类型) ? 值.map((x) => JSON.stringify(x)).join('\n') + (值.length ? '\n' : '') : JSON.stringify(值, null, 2) + '\n' }
}
const 固定来源 = Object.freeze({
  'relations:main': ['data/关系图.json', 'relations'],
  'relation-layout:main': ['cache/长期记忆关系图布局.json', 'auxiliary'],
  'diary-index:main': ['data/日记/索引.json', 'diary-index'],
  'extraction-buffer:main': ['cache/后台缓冲.json', 'extraction-buffer'],
  'usage:desktop': ['data/用量.jsonl', 'usage'],
  'usage:headless': ['data/核心用量.jsonl', 'usage'],
  'work-index:main': ['data/工作索引.json', 'work-index'],
  'background-state:relations': ['cache/记忆关系整理状态.json', 'auxiliary'],
  'background-state:relations-headless': ['data/关系整理状态.json', 'auxiliary'],
  'cluster-state:clusters': ['cache/记忆聚类候选.json', 'auxiliary'],
  'cluster-state:timeline': ['cache/记忆时间线候选.json', 'auxiliary'],
})
function 状态来源(一) {
  if (Object.hasOwn(固定来源, 一.document_id)) return 固定来源[一.document_id]
  const 配 = /^(channel-map|channel-tasks):([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})$/u.exec(一.document_id)
  if (配 && 配[1] === 一.kind) return [`channels/${配[2]}/${配[1] === 'channel-map' ? '映射' : '任务'}.json`, 一.kind]
  // D的通用槽位不是正式文件名；没有来源登记时不能猜测或漏掉。
  失败('SOURCE_UNMAPPED')
}
function 日记路径(一, 可见性) {
  if (!['日', '周'].includes(一.类型) || !/^\d{4}-(?:\d\d-\d\d|W\d\d)$/u.test(一.周期)) 失败('DIARY_PATH_INVALID')
  return 可见性 === 'private' ? `data/日记/私密/${一.周期.slice(0, 4)}/${一.周期}.json` : `data/日记/${一.类型}/${一.周期.slice(0, 4)}/${一.周期}.json`
}
function 投影文档(db, 会话, 旧格式) {
  const 文档们 = [], 加 = (路径, 类型, 值) => 文档们.push(文档(路径, 类型, 值))
  加('data/聊天记录/对话索引.json', 'conversations', db.prepare('SELECT conversation_id FROM chat_sessions ORDER BY registration_sequence').all().map((x) => 会话.读取对话(x.conversation_id)))
  加('data/聊天记录/聊天记录.jsonl', 'messages', db.prepare('SELECT payload_json FROM chat_messages ORDER BY rowid').all().map((x) => JSON.parse(x.payload_json)))
  for (const [类, 型] of [['事实', 'facts'], ['经历', 'episodes'], ['小本子', 'notebook']]) 加(`data/${类}.json`, 型, db.prepare('SELECT record_json FROM memory_long WHERE category=? ORDER BY rowid').all(类).map((x) => JSON.parse(x.record_json)))
  加('data/临时记忆.json', 'temporary', { 版本: 1, 记录: db.prepare('SELECT record_json FROM memory_temporary ORDER BY rowid').all().map((x) => JSON.parse(x.record_json)) })
  for (const 一 of db.prepare('SELECT * FROM state_documents ORDER BY document_id').all()) {
    const [路径, 类型] = 状态来源(一); 加(路径, 类型, JSON.parse(一.body_json))
  }
  for (const 一 of db.prepare('SELECT * FROM diary_entries ORDER BY visibility,period,diary_id').all()) {
    const 值 = JSON.parse(一.record_json); 加(日记路径(值, 一.visibility), 一.visibility === 'private' ? 'private-diary' : 'diary', 值)
  }
  加('data/日记/私密/评估索引.json', 'private-evaluations', { 格式版本: 1, 任务: db.prepare('SELECT record_json FROM diary_private_evaluations ORDER BY period').all().map((x) => JSON.parse(x.record_json)) })
  加('data/日记/私密/已删除.json', 'private-deletions', { 格式版本: 1, 周期: db.prepare("SELECT period FROM diary_deleted WHERE visibility='private' ORDER BY period").all().map((x) => x.period) })
  return (旧格式 ? 旧格式.合并回退文档(文档们, 旧格式范围) : 文档们).sort((a, b) => 排(a.路径, b.路径))
}
function 核对文档(文档们, 预期) {
  if (!Array.isArray(文档们) || 文档们.length !== 预期.length) 失败('DOCUMENT_SET_MISMATCH')
  const 原 = 创建样本库()
  try {
    原.导入({ 版本: 1, 用途: 'synthetic-sqlite-fixture', 文档: 文档们.map(({ 名称, 类型, 原文 }) => ({ 名称, 类型, 原文 })) })
    for (let i = 0; i < 预期.length; i++) {
      const a = 文档们[i], b = 预期[i]
      if (!相等(Object.keys(a).sort(), ['名称', '类型', '路径', '原文'].sort()) || a.名称 !== b.名称 || a.类型 !== b.类型 || a.路径 !== b.路径 || !相等(原文值(a), 原文值(b))) 失败('DOCUMENT_CONTENT_MISMATCH')
      // 原读取器不剥BOM的来源必须逐字可读，不能只在我们的宽松解析器里相等。
      if (a.类型 === 'channel-map') 校验渠道映射存档(JSON.parse(a.原文))
      if (a.类型 === 'channel-tasks') { const 值 = JSON.parse(a.原文); 校验渠道任务存档(值, 值.端点) }
      if (a.类型 === 'extraction-buffer') { if (Buffer.byteLength(a.原文) > 4 * 1024 * 1024) 失败('DOCUMENT_CONTENT_MISMATCH'); 校验后台缓冲(JSON.parse(a.原文)) }
      if (a.类型 === 'usage') for (const 行 of a.原文.split('\n').filter((x) => x.trim())) JSON.parse(行)
    }
  } finally { 原.关闭() }
}
function 核对外部文件(原 = []) {
  const 值 = 纯数据(原), 已见 = new Set()
  if (!Array.isArray(值) || 值.length > 200) 失败('FILES_INVALID')
  for (const 一 of 值) {
    if (!相等(Object.keys(一).sort(), ['路径', 'base64'].sort())) 失败('FILES_INVALID')
    const 路径 = 相对路径(一.路径), 键 = 路径.toLowerCase()
    // 附件/产物/原Markdown保持外部文件；不把密钥或学习进度塞进假造JSON槽位。
    if (!/^(data\/附件\/|data\/整理历史\/|data\/清空历史\/|workspace\/工作\/|workspace\/学习\/)/u.test(路径) || 已见.has(键)) 失败('FILES_INVALID')
    if (typeof 一.base64 !== 'string' || Buffer.from(一.base64, 'base64').toString('base64') !== 一.base64) 失败('FILES_INVALID')
    已见.add(键)
  }
  return 值.sort((a, b) => 排(a.路径, b.路径))
}
function 创建隔离仓储(选项) {
  const 上下文 = 创建内存上下文(选项)
  try { return 组合(上下文) } catch (错) { 上下文.关闭(); throw 错 }
}
function 组合(上下文) {
  const 会话 = 创建会话仓储(上下文), 记忆 = 创建记忆仓储(上下文), 状态 = 创建状态仓储(上下文), 日记 = 创建日记仓储(上下文), 旧格式 = 创建旧格式仓储(上下文)
  const db = 取内部(上下文).db
  const 架构 = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all().map((x) => ({ ...x }))
  const 表们 = 架构.filter((x) => x.type === 'table').map((x) => ({ 名称: x.name, 列: db.prepare(`PRAGMA table_info("${x.name}")`).all().map((y) => y.name) }))
  let 原文档 = []
  function 核验() {
    取内部(上下文)
    if (!相等(架构, db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all().map((x) => ({ ...x })))) 失败('SCHEMA_MISMATCH')
    会话.核验(); 记忆.核验(); 状态.核验(); 日记.核验(); 旧格式.核验()
    for (const 一 of db.prepare('SELECT kind,body_json FROM state_documents').all()) {
      const 值 = JSON.parse(一.body_json)
      if (一.kind === 'channel-map') 校验渠道映射存档(值)
      if (一.kind === 'channel-tasks') 校验渠道任务存档(值, 值.端点)
    }
    const 序列 = db.prepare('SELECT name,seq FROM sqlite_sequence').all(), 最大 = db.prepare('SELECT coalesce(max(registration_sequence),0) AS n FROM chat_sessions').get().n
    if (序列.length > 1 || (最大 && !序列.length) || 序列.some((x) => x.name !== 'chat_sessions' || !Number.isSafeInteger(x.seq) || x.seq < 最大)) 失败('SEQUENCE_INVALID')
    return { 好: true }
  }
  function 当前文档() {
    const 新 = 投影文档(db, 会话, 旧格式), 旧 = new Map(原文档.map((x) => [x.路径, x]))
    return 新.map((x) => { const 原 = 旧.get(x.路径); return 原 && 相等(原文值(原), 原文值(x)) ? 克隆(原) : x })
  }
  function 取快照() {
    核验()
    return { 架构指纹: 摘要(架构), 表: 表们.map((一) => ({ ...一, 行: db.prepare(`SELECT * FROM "${一.名称}" ORDER BY rowid`).all().map((行) => 一.列.map((列) => 行[列])) })) }
  }
  const 句柄 = Object.freeze({
    会话, 记忆, 状态, 日记, 旧格式, 核验, 关闭: () => 上下文.关闭(), 取状态: () => 上下文.取状态(),
    导出原格式(范围值) { 授权(范围值); return 原子执行(上下文, () => { 核验(); const 文档 = 当前文档(); 核对文档(文档, 投影文档(db, 会话, 旧格式)); return { 版本: 1, 用途: 'synthetic-json-rollback', 文档 } }) },
    封存原格式基线(原, 范围值) {
      授权(范围值); const 一 = 纯数据(原)
      if (!相等(Object.keys(一).sort(), ['版本', '用途', '文档'].sort()) || 一.版本 !== 1 || 一.用途 !== 'synthetic-json-rollback') 失败('BASELINE_INVALID')
      原子执行(上下文, () => { 核验(); 核对文档(一.文档, 投影文档(db, 会话, 旧格式)) })
      原文档 = 克隆(一.文档); return { 好: true, 文档数: 原文档.length }
    },
    创建备份(输入, 范围值) {
      授权(范围值); const 一 = 纯数据(输入)
      if (!相等(Object.keys(一).sort(), ['时间', '外部文件', '必须文件'].sort()) || !是时间(一.时间)) 失败('INPUT_INVALID')
      const 文件 = 核对外部文件(一.外部文件)
      if (!Array.isArray(一.必须文件) || !相等([...一.必须文件].sort(), 文件.map((x) => x.路径).sort())) 失败('FILES_INCOMPLETE')
      return 原子执行(上下文, () => {
        const 快照 = 取快照(), 文档 = 当前文档(); 核对文档(文档, 投影文档(db, 会话, 旧格式))
        // 原档只用于保留未变更文档的字节格式；删除的文档和旧正文不带入新备份。
        const 内容 = { 版本: 2, 用途: 'synthetic-sqlite-backup', 时间: 一.时间, 快照, 文档, 外部文件: 文件 }
        const 包 = { ...内容, 指纹: 摘要(内容) }; 纯数据(包); return 包
      })
    },
  })
  内部们.set(句柄, { 上下文, 架构, 表们, db, 取快照 })
  return 句柄
}
const 内部们 = new WeakMap()
function 恢复隔离仓储(原, 范围值) {
  授权(范围值); const 包 = 纯数据(原), { 指纹, ...内容 } = 包
  if (!相等(Object.keys(包).sort(), ['版本', '用途', '时间', '快照', '文档', '外部文件', '指纹'].sort()) || 包.用途 !== 'synthetic-sqlite-backup' || 指纹 !== 摘要(内容)) 失败('HASH_MISMATCH')
  if (包.版本 !== 2) 失败('VERSION_UNSUPPORTED')
  if (!是时间(包.时间)) 失败('INPUT_INVALID')
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), { 上下文, 架构, 表们, db } = 内部们.get(仓)
  try {
    if (包.快照.架构指纹 !== 摘要(架构) || !相等(Object.keys(包.快照).sort(), ['架构指纹', '表'].sort()) || !Array.isArray(包.快照.表) || 包.快照.表.length !== 表们.length) 失败('SCHEMA_MISMATCH')
    核对外部文件(包.外部文件)
    for (let i = 0; i < 表们.length; i++) {
      const 表 = 包.快照.表[i], 模板 = 表们[i]
      if (!相等(Object.keys(表).sort(), ['名称', '列', '行'].sort()) || 表.名称 !== 模板.名称 || !相等(表.列, 模板.列) || !Array.isArray(表.行) || 表.行.some((x) => !Array.isArray(x) || x.length !== 模板.列.length || x.some((v) => v !== null && typeof v !== 'string' && typeof v !== 'number'))) 失败('TABLE_INVALID')
    }
    原子执行(上下文, () => {
      db.exec('PRAGMA defer_foreign_keys=ON')
      for (const 表 of 表们) db.exec(`DELETE FROM "${表.名称}"`)
      for (const 表 of 包.快照.表.filter((x) => x.名称 !== 'sqlite_sequence')) {
        const 句 = db.prepare(`INSERT INTO "${表.名称}"(${表.列.map((x) => '"' + x + '"').join(',')}) VALUES(${表.列.map(() => '?').join(',')})`)
        for (const 行 of 表.行) 句.run(...行)
      }
      db.exec('DELETE FROM sqlite_sequence')
      for (const 行 of 包.快照.表.find((x) => x.名称 === 'sqlite_sequence').行) db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(...行)
      仓.核验(); 核对文档(包.文档, 投影文档(db, 仓.会话, 仓.旧格式))
    })
    仓.封存原格式基线({ 版本: 1, 用途: 'synthetic-json-rollback', 文档: 包.文档 }, 范围)
    return 仓
  } catch (错) { 仓.关闭(); throw new Error(/^SQLITE_(BACKUP|CONTEXT)_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'SQLITE_BACKUP_RESTORE_REJECTED') }
}
module.exports = { 创建隔离仓储, 恢复隔离仓储, 相对路径, 内部备份测试: (仓) => 内部们.get(仓), 备份范围: 范围 }
