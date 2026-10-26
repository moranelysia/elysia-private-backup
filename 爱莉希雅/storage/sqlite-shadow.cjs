/** F1：显式本机范围的只读盘点；原文只在内存影子档案往返，报告没有正文。 */
'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const { 创建影子档案 } = require('./sqlite-fixture.cjs')
const 范围 = Object.freeze({ 用途: 'local-readonly-shadow', 包含私密: true })
const 哈希 = (b) => createHash('sha256').update(b).digest('hex')
function 失败(码) { throw Error('SQLITE_SHADOW_' + 码) }
const 固定 = {
  'data/聊天记录/对话索引.json': 'conversations', 'data/聊天记录/聊天记录.jsonl': 'messages',
  'data/事实.json': 'facts', 'data/经历.json': 'episodes', 'data/小本子.json': 'notebook', 'data/临时记忆.json': 'temporary',
  'data/关系图.json': 'relations', 'data/工作索引.json': 'work-index', 'data/用量.jsonl': 'usage', 'data/核心用量.jsonl': 'usage',
  'data/日记/索引.json': 'diary-index', 'data/日记/私密/评估索引.json': 'private-evaluations', 'data/日记/私密/已删除.json': 'private-deletions',
  'data/关系整理状态.json': 'auxiliary', 'cache/后台缓冲.json': 'extraction-buffer', 'cache/长期记忆关系图布局.json': 'auxiliary',
  'cache/记忆关系整理状态.json': 'auxiliary', 'cache/记忆聚类候选.json': 'auxiliary', 'cache/记忆时间线候选.json': 'auxiliary',
}
function 分类(逻辑) {
  if (Object.hasOwn(固定, 逻辑)) return 固定[逻辑]
  if (/^data\/日记\/(日|周)\/\d{4}\/\d{4}-(?:\d\d-\d\d|W\d\d)\.json$/u.test(逻辑)) return 'diary'
  if (/^data\/日记\/私密\/\d{4}\/\d{4}-\d\d-\d\d\.json$/u.test(逻辑)) return 'private-diary'
  if (/^data\/(附件|整理历史|清空历史)\//u.test(逻辑)) return 'external'
  if (/^data\/聊天记录\/.+(?:\.已并入|前.*\.jsonl|前.*\.json|\.清理前\.jsonl)$/u.test(逻辑)) return 'historical'
  return 'unmapped'
}
function 核根(根) {
  if (typeof 根 !== 'string' || !path.isAbsolute(根) || /^[\\/]{2}/u.test(根)) 失败('PATH_INVALID')
  根 = path.resolve(根)
  for (let p = 根;; p = path.dirname(p)) { if (fs.lstatSync(p).isSymbolicLink()) 失败('LINK_FORBIDDEN'); if (path.dirname(p) === p) break }
  if (!fs.statSync(根).isDirectory()) 失败('ROOT_INVALID')
  return fs.realpathSync(根)
}
const 签 = (s) => [String(s.dev), String(s.ino), String(s.size), String(s.mtimeNs), String(s.ctimeNs)].join(':')
function 盘点(数据根, 缓存根) {
  const 项 = [], 已见 = new Set(); let 节点数 = 0
  function 加(根, 域, 相对, 深 = 0) {
    if (深 > 12 || ++节点数 > 4000 || 项.length >= 2000) 失败('LIMIT')
    const 文件 = path.join(根, 相对), 实 = fs.lstatSync(文件, { bigint: true }), 逻辑 = 域 + '/' + 相对.split(path.sep).join('/')
    if (实.isSymbolicLink()) 失败('LINK_FORBIDDEN')
    if (实.isDirectory()) { for (const 名 of fs.readdirSync(文件).sort()) 加(根, 域, path.join(相对, 名), 深 + 1); return }
    if (!实.isFile() || 实.nlink !== 1n || 实.size > BigInt(Number.MAX_SAFE_INTEGER)) 失败('FILE_INVALID')
    const 键 = 逻辑.toLowerCase(); if (已见.has(键)) 失败('PATH_COLLISION'); 已见.add(键)
    项.push({ 逻辑, 文件, 类型: 分类(逻辑), 签名: 签(实), 字节数: Number(实.size) })
  }
  for (const 名 of fs.readdirSync(数据根).sort()) 加(数据根, 'data', 名)
  // cache中只有这五个登记的持久业务来源；不扫描素材/下载/临时聊天。
  for (const 键 of Object.keys(固定).filter((x) => x.startsWith('cache/')).sort()) {
    const 相对 = 键.slice(6); try { fs.lstatSync(path.join(缓存根, 相对)); 加(缓存根, 'cache', 相对) } catch (错) { if (错.code !== 'ENOENT') throw 错 }
  }
  return 项.sort((a, b) => a.逻辑 < b.逻辑 ? -1 : a.逻辑 > b.逻辑 ? 1 : 0)
}
function 读原文(一) {
  if (一.字节数 > 2 * 1024 * 1024) 失败('LIMIT')
  const fd = fs.openSync(一.文件, 'r')
  try {
    if (签(fs.fstatSync(fd, { bigint: true })) !== 一.签名) 失败('SOURCE_CHANGED')
    const b = fs.readFileSync(fd)
    if (b.length !== 一.字节数 || 签(fs.fstatSync(fd, { bigint: true })) !== 一.签名) 失败('SOURCE_CHANGED')
    const 原文 = b.toString('utf8'); if (!Buffer.from(原文).equals(b)) 失败('UTF8_INVALID')
    return { 原文, sha256: 哈希(b) }
  } finally { fs.closeSync(fd) }
}
function 统计兼容(文档) {
  const 是UTC = (t) => typeof t === 'string' && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t
  return 文档.filter((x) => ['messages', 'conversations', 'facts', 'episodes', 'notebook'].includes(x.类型)).map((x) => {
    const raw = x.原文.replace(/^\uFEFF/u, ''), 行 = x.类型 === 'messages' ? raw.split('\n').filter((s) => s.trim()).map((s) => JSON.parse(s)) : JSON.parse(raw)
    return { 来源: x.逻辑, 条数: 行.length, 缺编号: 行.filter((v) => typeof v.编号 !== 'string' || !v.编号).length, 非规范UTC时间: 行.filter((v) => !是UTC(x.类型 === 'conversations' ? v.建于 : v.时间)).length,
      ...(x.类型 === 'messages' ? { 缺轮次: 行.filter((v) => !v.轮次).length, 缺序号: 行.filter((v) => !Number.isSafeInteger(v.序号)).length } : {}) }
  })
}
function 检查只读影子(选项, 授权) {
  const 精确 = (x, keys) => x && Object.getPrototypeOf(x) === Object.prototype && Reflect.ownKeys(x).length === keys.length && keys.every((k) => { const d = Object.getOwnPropertyDescriptor(x, k); return d && Object.hasOwn(d, 'value') && d.enumerable })
  if (!精确(授权, ['用途', '包含私密']) || 授权.用途 !== 范围.用途 || 授权.包含私密 !== true) 失败('SCOPE_REQUIRED')
  if (!精确(选项, ['数据目录', '缓存目录'])) 失败('INPUT_INVALID')
  const 数据根 = 核根(选项.数据目录), 缓存根 = 核根(选项.缓存目录)
  const 互相 = path.relative(数据根, 缓存根), 反 = path.relative(缓存根, 数据根)
  const 在内 = (rel) => !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)
  if (在内(互相) || 在内(反)) 失败('ROOT_OVERLAP')
  const 源 = 盘点(数据根, 缓存根), 文档 = []; let 字节 = 0
  for (const 一 of 源.filter((x) => !['external', 'historical', 'unmapped'].includes(x.类型))) {
    字节 += 一.字节数; if (字节 > 8 * 1024 * 1024 || 文档.length >= 64) 失败('LIMIT')
    文档.push({ 名称: 'shadow-' + 哈希(一.逻辑).slice(0, 32), 类型: 一.类型, 逻辑: 一.逻辑, ...读原文(一) })
  }
  const 后 = 盘点(数据根, 缓存根)
  if (JSON.stringify(源.map(({ 逻辑, 签名 }) => [逻辑, 签名])) !== JSON.stringify(后.map(({ 逻辑, 签名 }) => [逻辑, 签名]))) 失败('SOURCE_CHANGED')
  for (const 一 of 文档) if (读原文(后.find((x) => x.逻辑 === 一.逻辑)).sha256 !== 一.sha256) 失败('SOURCE_CHANGED')
  const 档案 = 创建影子档案(范围); let 回退一致 = false, 错误 = null, 统计 = null
  try {
    const 包 = { 版本: 1, 用途: 范围.用途, 文档: 文档.map(({ 名称, 类型, 原文 }) => ({ 名称, 类型, 原文 })) }
    档案.导入(包); 档案.核验(); 回退一致 = JSON.stringify(档案.导出回退快照({ 用途: 'migration-rollback', 包含私密: true })) === JSON.stringify(包); 统计 = 档案.取统计()
    if (!回退一致) 失败('ROUNDTRIP_FAILED')
  } catch (错) { 错误 = /^SQLITE_(?:FIXTURE|SHADOW)_[A-Z_]+$/u.test(错.message) ? 错.message : 'SQLITE_SHADOW_ARCHIVE_REJECTED' }
  finally { 档案.关闭() }
  // 第二次校验后不再读源；这里是诊断性采样，未停写不能冒充全局一致快照。
  let 兼容 = []
  if (!错误) 兼容 = 统计兼容(文档)
  return { 版本: 1, 用途: 'local-shadow-report', 可切换: false, 一致性: '双次读取一致的诊断采样，未停写', 原文回退一致: 回退一致, 档案错误: 错误, 统计,
    来源: 源.map(({ 逻辑, 类型, 字节数 }) => ({ 来源: 逻辑, 类型, 字节数 })), 文档哈希: 文档.map(({ 逻辑, sha256 }) => ({ 来源: 逻辑, sha256 })), 兼容,
    未存在的已登记来源: Object.keys(固定).filter((k) => !源.some((x) => x.逻辑 === k)).sort(),
    阻断: ['SOURCE_NOT_FROZEN', 'MUTABLE_LEGACY_ADAPTER_REQUIRED', ...(源.some((x) => x.类型 === 'unmapped') ? ['UNMAPPED_SOURCE'] : []), ...(错误 ? ['ARCHIVE_REJECTED'] : [])],
    范围外: ['渠道独立存档根须另行显式登记', '工作/学习原文件及源码完整备份未执行', '外部附件/历史文件仅读元数据，未核对内容哈希'] }
}
module.exports = { 检查只读影子, 创建影子范围: () => ({ ...范围 }), 分类 }
