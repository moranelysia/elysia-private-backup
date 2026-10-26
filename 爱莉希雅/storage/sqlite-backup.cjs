/** S-15E：隔离仓储组合、同事务逻辑快照和原格式反导出；无正式目录/网络入口。 */
'use strict'
const { createHash } = require('node:crypto')
const { 创建内存上下文, 创建本机影子上下文, 取内部, 原子执行 } = require('./sqlite-context.cjs')
const { 创建会话仓储 } = require('./sqlite-chat.cjs')
const { 创建记忆仓储 } = require('./sqlite-memory.cjs')
const { 创建状态仓储, 纯数据 } = require('./sqlite-state.cjs')
const { 创建日记仓储 } = require('./sqlite-diary.cjs')
const { 创建样本库, 创建影子档案 } = require('./sqlite-fixture.cjs')
const { 固定状态来源: 固定来源, 识别来源 } = require('./sqlite-sources.cjs')
const { 准备旧状态, 核验旧状态绑定 } = require('./sqlite-state-import.cjs')
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
  加('data/日记/私密/评估索引.json', 'private-evaluations', { 格式版本: 1, 任务: db.prepare('SELECT record_json FROM diary_private_evaluations ORDER BY rowid').all().map((x) => JSON.parse(x.record_json)) })
  加('data/日记/私密/已删除.json', 'private-deletions', { 格式版本: 1, 周期: db.prepare("SELECT period FROM diary_deleted WHERE visibility='private' ORDER BY rowid").all().map((x) => x.period) })
  return (旧格式 ? 旧格式.合并回退文档(文档们, 旧格式范围) : 文档们).sort((a, b) => 排(a.路径, b.路径))
}
function 核对文档(文档们, 预期, 本机 = false) {
  if (!Array.isArray(文档们) || 文档们.length !== 预期.length) 失败('DOCUMENT_SET_MISMATCH')
  const 原 = 本机 ? 创建影子档案({ 用途: 'local-readonly-shadow', 包含私密: true }) : 创建样本库()
  try {
    原.导入({ 版本: 1, 用途: 本机 ? 'local-readonly-shadow' : 'synthetic-sqlite-fixture', 文档: 文档们.map(({ 名称, 类型, 原文 }) => ({ 名称, 类型, 原文 })) })
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
function 核对外部文件(原 = [], 本机 = false) {
  const 值 = 纯数据(原), 已见 = new Set()
  if (!Array.isArray(值) || 值.length > 200) 失败('FILES_INVALID')
  const 引用 = 值.length > 0 && Object.hasOwn(值[0], 'sha256')
  if (引用 && !本机) 失败('FILES_INVALID')
  let 总字节 = 0
  for (const 一 of 值) {
    if (!相等(Object.keys(一).sort(), (引用 ? ['路径','sha256','字节数'] : ['路径','base64']).sort())) 失败('FILES_INVALID')
    const 路径 = 相对路径(一.路径), 键 = 路径.toLowerCase()
    // 附件/产物/原Markdown保持外部文件；不把密钥或学习进度塞进假造JSON槽位。
    if (识别来源(路径).去向 !== 'external' || 已见.has(键)) 失败('FILES_INVALID')
    if (引用) { if (!Number.isSafeInteger(一.字节数) || 一.字节数 < 0 || 一.字节数 > 64*1024*1024 || typeof 一.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(一.sha256)) 失败('FILES_INVALID'); 总字节 += 一.字节数; if(总字节>256*1024*1024)失败('FILES_INVALID') }
    else if (typeof 一.base64 !== 'string' || Buffer.from(一.base64, 'base64').toString('base64') !== 一.base64) 失败('FILES_INVALID')
    已见.add(键)
  }
  return 值.sort((a, b) => 排(a.路径, b.路径))
}
function 核对资源引用(原, 文件, 本机){
  const a=纯数据(原),seen=new Set();if(!本机||!Array.isArray(a)||a.length>1000)失败('REFERENCES_INVALID')
  for(const r of a){if(!相等(Object.keys(r).sort(),['类型','原始路径','逻辑路径','状态'].sort())||!['attachment','work-product'].includes(r.类型)||typeof r.原始路径!=='string'||!r.原始路径||r.原始路径.length>4096||/[\x00-\x1f]/u.test(r.原始路径))失败('REFERENCES_INVALID');const key=JSON.stringify([r.类型,r.原始路径]);if(seen.has(key))失败('REFERENCES_INVALID');seen.add(key)
    if(r.状态==='present'){相对路径(r.逻辑路径);if(!文件.some(f=>f.路径===r.逻辑路径))失败('REFERENCES_INVALID')}
    else if(r.状态!=='missing-before-freeze'||r.逻辑路径!==null)失败('REFERENCES_INVALID')
  }return a
}
function 创建隔离仓储(选项) {
  const 上下文 = 创建内存上下文(选项)
  try { return 组合(上下文) } catch (错) { 上下文.关闭(); throw 错 }
}
function 创建本机影子仓储(选项) {
  const 上下文 = 创建本机影子上下文(选项)
  try { return 组合(上下文) } catch (错) { 上下文.关闭(); throw 错 }
}
function 组合(上下文) {
  const 会话 = 创建会话仓储(上下文), 记忆 = 创建记忆仓储(上下文), 状态 = 创建状态仓储(上下文), 日记 = 创建日记仓储(上下文), 旧格式 = 创建旧格式仓储(上下文)
  const { db, 本机 } = 取内部(上下文), 原格式用途 = 本机 ? 'local-json-rollback' : 'synthetic-json-rollback'
  const 架构 = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all().map((x) => ({ ...x }))
  const 表们 = 架构.filter((x) => x.type === 'table').map((x) => ({ 名称: x.name, 列: db.prepare(`PRAGMA table_info("${x.name}")`).all().map((y) => y.name) }))
  let 原文档 = [], 资源引用 = []
  function 核验() {
    取内部(上下文)
    if (!相等(架构, db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name").all().map((x) => ({ ...x })))) 失败('SCHEMA_MISMATCH')
    会话.核验(); 记忆.核验(); 状态.核验(); 日记.核验(); 旧格式.核验(); 核验旧状态绑定(db)
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
    导出原格式(范围值) { 授权(范围值); return 原子执行(上下文, () => { 核验(); const 文档 = 当前文档(); 核对文档(文档, 投影文档(db, 会话, 旧格式), 本机); return { 版本: 1, 用途: 原格式用途, 文档 } }) },
    导入旧状态(原, 范围值) {
      授权(范围值); const p = 准备旧状态(上下文, 原); let 基线
      const 回 = 原子执行(上下文, () => {
        核验(); const r = p.应用(db); 核验()
        if (r.新导入) {
          const by = new Map(p.文档.map((d) => [d.路径,d])); 基线 = 当前文档().map((d) => by.has(d.路径) ? { ...d, 原文:by.get(d.路径).原文 } : d)
          核对文档(基线, 投影文档(db, 会话, 旧格式), 本机)
        }
        return r
      })
      if (基线) 原文档 = 克隆(基线)
      return 回
    },
    封存原格式基线(原, 范围值) {
      授权(范围值); const 一 = 纯数据(原)
      if (!相等(Object.keys(一).sort(), ['版本', '用途', '文档'].sort()) || 一.版本 !== 1 || 一.用途 !== 原格式用途) 失败('BASELINE_INVALID')
      原子执行(上下文, () => { 核验(); 核对文档(一.文档, 投影文档(db, 会话, 旧格式), 本机) })
      原文档 = 克隆(一.文档); return { 好: true, 文档数: 原文档.length }
    },
    创建备份(输入, 范围值) {
      授权(范围值); const 一 = 纯数据(输入)
      if (!相等(Object.keys(一).sort(), ['时间', '外部文件', '必须文件',...(Object.hasOwn(一,'资源引用')?['资源引用']:[])].sort()) || !是时间(一.时间)) 失败('INPUT_INVALID')
      const 文件 = 核对外部文件(一.外部文件, 本机)
      const 引用=本机?核对资源引用(一.资源引用??资源引用,文件,true):[]
      if(!本机&&Object.hasOwn(一,'资源引用'))失败('REFERENCES_INVALID')
      if (!Array.isArray(一.必须文件) || !相等([...一.必须文件].sort(), 文件.map((x) => x.路径).sort())) 失败('FILES_INCOMPLETE')
      const 回 = 原子执行(上下文, () => {
        const 快照 = 取快照(), 文档 = 当前文档(); 核对文档(文档, 投影文档(db, 会话, 旧格式), 本机)
        // 原文基线只保留未变更业务文档的格式，删除正文不回到回退文档；
        // 完整逻辑快照仍含记忆删除档案及legacy来源原文，不是物理擦除备份。
        // v4包含旧状态绑定清单；旧恢复器不能忽略覆盖约束或重排原私密索引。
        const 版 = 文件.some(x=>Object.hasOwn(x,'sha256')) || 引用.length ? 5 : db.prepare("SELECT 1 FROM repository_meta WHERE key='state_import_manifest'").get() ? 4 : db.prepare("SELECT 1 FROM repository_meta WHERE key='legacy_memory_binding'").get() ? 3 : 2
        const 内容 = { 版本: 版, 用途: 本机 ? 'local-sqlite-shadow-backup' : 'synthetic-sqlite-backup', 时间: 一.时间, 快照, 文档, 外部文件: 文件,...(版===5?{资源引用:引用}:{}) }
        const 包 = { ...内容, 指纹: 摘要(内容) }; 纯数据(包); return 包
      })
      if(本机)资源引用=克隆(引用);return 回
    },
  })
  内部们.set(句柄, { 上下文, 架构, 表们, db, 取快照, 设置资源引用:x=>{资源引用=克隆(x)} })
  return 句柄
}
const 内部们 = new WeakMap()
function 恢复隔离仓储(原, 范围值) { return 恢复仓储(原, 范围值, false) }
function 恢复本机影子仓储(原, 范围值) { return 恢复仓储(原, 范围值, true) }
function 恢复仓储(原, 范围值, 本机) {
  授权(范围值); const 包 = 纯数据(原), { 指纹, ...内容 } = 包
  if (!相等(Object.keys(包).sort(), ['版本', '用途', '时间', '快照', '文档', '外部文件', '指纹',...(包.版本===5?['资源引用']:[])].sort()) || 包.用途 !== (本机 ? 'local-sqlite-shadow-backup' : 'synthetic-sqlite-backup') || 指纹 !== 摘要(内容)) 失败('HASH_MISMATCH')
  if (![2, 3, 4, 5].includes(包.版本)) 失败('VERSION_UNSUPPORTED')
  if (!是时间(包.时间)) 失败('INPUT_INVALID')
  const 仓 = 本机 ? 创建本机影子仓储({ 用途:'local-shadow-repository', 包含私密:true }) : 创建隔离仓储({ 用途:'synthetic-sqlite-repository' }), { 上下文, 架构, 表们, db } = 内部们.get(仓)
  try {
    if (包.快照.架构指纹 !== 摘要(架构) || !相等(Object.keys(包.快照).sort(), ['架构指纹', '表'].sort()) || !Array.isArray(包.快照.表) || 包.快照.表.length !== 表们.length) 失败('SCHEMA_MISMATCH')
    核对外部文件(包.外部文件, 本机)
    const 引用=包.版本===5?核对资源引用(包.资源引用,包.外部文件,本机):[]
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
      const 状态绑定 = !!db.prepare("SELECT 1 FROM repository_meta WHERE key='state_import_manifest'").get(), 记忆绑定 = !!db.prepare("SELECT 1 FROM repository_meta WHERE key='legacy_memory_binding'").get()
      const expected = 包.外部文件.some(x=>Object.hasOwn(x,'sha256')) || 引用.length ? 5 : 状态绑定 ? 4 : 记忆绑定 ? 3 : 2
      if (包.版本 !== expected || (包.版本 === 5 && !本机)) 失败('VERSION_UNSUPPORTED')
      仓.核验(); 核对文档(包.文档, 投影文档(db, 仓.会话, 仓.旧格式), 本机)
    })
    仓.封存原格式基线({ 版本: 1, 用途: 本机 ? 'local-json-rollback' : 'synthetic-json-rollback', 文档: 包.文档 }, 范围)
    内部们.get(仓).设置资源引用(引用)
    return 仓
  } catch (错) { 仓.关闭(); throw new Error(/^SQLITE_(BACKUP|CONTEXT)_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'SQLITE_BACKUP_RESTORE_REJECTED') }
}
module.exports = { 创建隔离仓储, 恢复隔离仓储, 创建本机影子仓储, 恢复本机影子仓储, 相对路径, 内部备份测试: (仓) => 内部们.get(仓), 备份范围: 范围 }
