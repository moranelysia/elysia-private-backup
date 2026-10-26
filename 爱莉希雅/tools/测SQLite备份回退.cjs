'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createHash } = require('node:crypto'), { execFileSync } = require('node:child_process')
const 根们 = [fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-sqlite-E-'))]
process.env.ELYSIA_WORKSPACE_ROOT = 根们[0]; process.env.ELYSIA_CONFIG_FILE = path.join(根们[0], 'absent.json')
process.env.ELYSIA_DATA_DIR = path.join(根们[0], 'data'); process.env.ELYSIA_CACHE_DIR = path.join(根们[0], 'cache')
const { 创建隔离仓储, 恢复隔离仓储, 内部备份测试, 备份范围, 相对路径 } = require('../storage/sqlite-backup.cjs')
const { 写入隔离回退 } = require('../storage/rollback-files.cjs'), { 备份范围清单 } = require('../storage/backup-manifest.cjs')
const { 场景, 渠道, 篇, 存状态, 时间, 本机, 拷 } = require('./fixtures/sqlite-backup-scenario.cjs')
const 测试 = [], 测 = (名, 做) => 测试.push([名, 做]), 哈希 = (一) => createHash('sha256').update(一).digest('hex')
const 盖章 = (包) => { const { 指纹, ...内容 } = 包; return { ...内容, 指纹: 哈希(JSON.stringify(内容)) } }
const 文 = (包, 路径) => 包.文档.find((x) => x.路径 === 路径)
const 备 = (仓, 改 = {}) => 仓.创建备份({ 时间, 外部文件: [], 必须文件: [], ...改 }, 备份范围)
async function 用场景(做) { const s = await 场景(); try { await 做(s) } finally { s.仓.关闭() } }
function 用空库(做) { const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }); try { return 做(仓) } finally { 仓.关闭() } }
function 用恢复(包, 做) { const r = 恢复隔离仓储(包, 备份范围); try { return 做(r) } finally { r.关闭() } }
function 原文基线(s) {
  const 基线 = s.仓.导出原格式(备份范围)
  for (const 一 of 基线.文档) 一.原文 = (['channel-map', 'channel-tasks', 'extraction-buffer', 'usage'].includes(一.类型) ? '' : '\uFEFF') + 一.原文.replace(/\n/gu, '\r\n') + (['messages', 'usage'].includes(一.类型) ? '\r\n' : '')
  s.仓.封存原格式基线(基线, 备份范围); return 基线
}
测('fake权限任务→聊天整轮→证据晋升→日记状态在同库，18表可恢复', () => 用场景((s) => {
  const 包 = s.备份(); assert.equal(包.快照.表.length, 18); assert.equal(包.文档.length, 24)
  用恢复(包, (r) => { assert.deepEqual(备(r, { 外部文件: s.文件, 必须文件: s.文件.map((x) => x.路径) }), 包); assert.equal(r.记忆.取统计().证据数, 1); assert.equal(r.日记.读取本机私密(本机).length, 1) })
}))
测('恢复后的整轮和晋升原请求幂等，回执/编号/顺序不变', () => 用场景((s) => 用恢复(s.备份(), (r) => {
  const 统计 = r.记忆.取统计(); assert.deepEqual(r.会话.存对话一轮(s.轮), s.回执); assert.deepEqual(r.记忆.评估并晋升(s.晋升输入), s.晋升); assert.deepEqual(r.记忆.取统计(), 统计); assert.equal(r.会话.取统计().消息数, 2)
})))
测('恢复任务去重不会再处理或发第二条模拟消息', () => 用场景(async (s) => {
  const r = 恢复隔离仓储(s.备份(), 备份范围)
  try { const 回 = await 渠道(r, () => assert.fail('REPLAY_CORE')); assert.equal(回.观测.模拟送达数, 0); assert.equal(回.任务[0].状态, 'sent') } finally { r.关闭() }
}))
测('恢复后新增会话序列连续、旧上下文游标失效', () => 用场景((s) => {
  const 页 = s.仓.会话.读消息页({ 对话: s.对话, 大小: 1 }), 包 = s.备份()
  用恢复(包, (r) => { assert.throws(() => r.会话.读消息页({ 对话: s.对话, 游标: 页.下一页 })); assert.equal(r.会话.登记对话('new-chat', { 建于: 时间 }).好, true); assert.equal(内部备份测试(r).db.prepare('SELECT max(registration_sequence) AS n FROM chat_sessions').get().n, 2); assert.equal(r.核验().好, true) })
}))
测('未修改文档的BOM/CRLF/JSONL空行逐字节保留', () => 用场景((s) => { const 基线 = 原文基线(s); assert.deepEqual(s.备份().文档, 基线.文档); 用恢复(s.备份(), (r) => assert.deepEqual(r.导出原格式(备份范围).文档, 基线.文档)) }))
测('新增修改删除后反导出当前数据，不还原旧基线；private旧正文不复活', () => 用场景((s) => {
  原文基线(s); const { 已删 } = s.改动(), 包 = s.备份()
  assert.equal(JSON.stringify(包).includes('我捏着衣角'), false)
  assert.equal(包.文档.some((x) => x.路径.endsWith('/2026-10-24.json')), false)
  assert.equal(JSON.parse(文(包, 'data/事实.json').原文).length, 0)
  assert.equal(JSON.parse(文(包, 'data/经历.json').原文)[0].内容, '我们一起听了新的曲子')
  assert.equal(文(包, 'data/聊天记录/聊天记录.jsonl').原文.trim().split('\n').length, 4)
  assert.equal(JSON.parse(文(包, 'data/关系图.json').原文).自动抑制.length, 1)
  用恢复(包, (r) => { r.记忆.评估并晋升(s.晋升输入); assert.equal(r.记忆.列长期().列表.some((x) => x.编号 === 已删), false); assert.equal(r.日记.写入私密({ 日记: 篇(true), 预期版本: 0 }).代码, 'SQLITE_DIARY_DELETED'); assert.equal(r.日记.读取共享().length, 2) })
}))
测('默认共享导出不含私密；完整备份要求显式范围', () => 用场景((s) => {
  assert.equal(JSON.stringify(s.仓.日记.导出共享()).includes('捏着衣角'), false)
  for (const 范围 of [undefined, {}, { 用途: 'shared', 包含私密: true }, { 用途: 'local-migration-backup', 包含私密: false }]) { assert.throws(() => s.仓.导出原格式(范围)); assert.throws(() => 恢复隔离仓储(s.备份(), 范围)) }
}))
测('基线不能覆盖现有业务值、缺省/null/空串扩展不混淆', () => 用场景((s) => {
  const 一 = s.仓.导出原格式(备份范围), 二 = 拷(一); 二.文档[0].原文 = '{}'
  assert.throws(() => s.仓.封存原格式基线(二, 备份范围)); assert.deepEqual(s.仓.导出原格式(备份范围), 一)
  用恢复(s.备份(), (r) => assert.deepEqual(r.会话.读取对话(s.对话).扩展, { 空值: null, 空串: '' }))
}))
测('重复JSON键和非法原文不能混入源档案', () => 用空库((r) => {
  const 包 = r.导出原格式(备份范围); 文(包, 'data/临时记忆.json').原文 = '{"版本":1,"版本":1,"记录":[]}'
  assert.throws(() => r.封存原格式基线(包, 备份范围))
}))
测('未登记来源不能遗漏；学习Markdown不能假装JSON槽位', () => 用空库((r) => { 存状态(r, 'learning-index', { 原样: true }); assert.throws(() => 备(r), { message: 'SQLITE_BACKUP_SOURCE_UNMAPPED' }) }))
测('严格原读取器不接受的BOM基线拒绝，不能悄悄丢缓冲/账单', () => 用场景((s) => {
  for (const 路径 of ['channels/fake/映射.json', 'channels/fake/任务.json', 'cache/后台缓冲.json', 'data/用量.jsonl']) { const 包 = s.仓.导出原格式(备份范围); 文(包, 路径).原文 = '\uFEFF' + 文(包, 路径).原文; assert.throws(() => s.仓.封存原格式基线(包, 备份范围)) }
}))
测('后台缓冲沿用原校验，坏时间和非渠道归属不能发布', () => 用空库((r) => {
  存状态(r, 'extraction-buffer', { 版本: 1, 轮次: [{ 对话: 'not-channel', 消息编号: 'one', 用户原话: '虚构', 她的回复: '虚构', 接收于: 'bad', 消息时间: 'bad' }] })
  assert.throws(() => 备(r))
}))
测('桌面与无界面关系检查点分别映射，不能覆盖彼此', () => 用场景((s) => {
  const 包 = s.备份(); assert.equal(JSON.parse(文(包, 'data/关系整理状态.json').原文).端, 'headless'); assert.equal(JSON.parse(文(包, 'cache/记忆关系整理状态.json').原文).扩展.不猜测, true)
}))
测('原文绑定不是历史导入，无编号/无时区旧档不能猜成新记录', () => 用空库((r) => {
  const 包 = r.导出原格式(备份范围); 文(包, 'data/聊天记录/聊天记录.jsonl').原文 = JSON.stringify({ 角色: 'user', 时间: '2026-10-01 19:03', 内容: '旧格式虚构原话' }) + '\n'
  assert.throws(() => r.封存原格式基线(包, 备份范围)); assert.equal(r.会话.取统计().消息数, 0)
}))
测('外部必备文件缺项、多项、重复及大小写重名拒绝', () => 用空库((r) => {
  const f = { 路径: 'data/附件/a.bin', base64: 'AA==' }
  for (const 改 of [{ 必须文件: ['data/附件/a.bin'] }, { 外部文件: [f] }, { 外部文件: [f, f], 必须文件: [f.路径, f.路径] }, { 外部文件: [f, { ...f, 路径: 'data/附件/A.bin' }], 必须文件: [f.路径, 'data/附件/A.bin'] }]) assert.throws(() => 备(r, 改))
}))
测('附件白名单、规范base64、超限输入拒绝且不截断', () => 用空库((r) => {
  for (const f of [{ 路径: 'data/钥匙.txt', base64: 'AA==' }, { 路径: 'data/附件/a', base64: 'AA' }, { 路径: 'data/附件/a', base64: 'A'.repeat(2 * 1024 * 1024 + 1) }]) assert.throws(() => 备(r, { 外部文件: [f], 必须文件: [f.路径] }))
}))
for (const [名, 改] of [
  ['外层哈希', (p) => { p.指纹 = 'bad'; return p }],
  ['未知字段', (p) => 盖章({ ...p, 意外: true })],
  ['时间无效', (p) => 盖章({ ...p, 时间: 'bad' })],
  ['schema哈希', (p) => { p.快照.架构指纹 = 'bad'; return 盖章(p) }],
  ['缺表', (p) => { p.快照.表.pop(); return 盖章(p) }],
  ['错列', (p) => { p.快照.表[0].列[0] = 'wrong'; return 盖章(p) }],
  ['伪SQL表名', (p) => { p.快照.表[0].名称 = 'x;DROP TABLE chat_sessions'; return 盖章(p) }],
  ['错行宽', (p) => { p.快照.表.find((x) => x.行.length).行[0].push('extra'); return 盖章(p) }],
  ['缺文档', (p) => { p.文档.pop(); return 盖章(p) }],
  ['篡改正文', (p) => { 文(p, 'data/事实.json').原文 = '[]'; return 盖章(p) }],
  ['序列倒退', (p) => { p.快照.表.find((x) => x.名称 === 'sqlite_sequence').行[0][1] = 0; return 盖章(p) }],
  ['回执损坏', (p) => { const t = p.快照.表.find((x) => x.名称 === 'chat_turns'); t.行[0][t.列.indexOf('receipt_json')] = '{}'; return 盖章(p) }],
  ['外键悬空', (p) => { const t = p.快照.表.find((x) => x.名称 === 'memory_evidence'); t.行[0][0] = 'absent'; return 盖章(p) }],
]) 测(`损坏包拒绝：${名}，原仓储不变`, () => 用场景((s) => { const 包 = s.备份(); assert.throws(() => 恢复隔离仓储(改(拷(包)), 备份范围)); assert.deepEqual(s.备份(), 包) }))
测('原渠道完整校验拒绝浅结构合法但任务身份不符', () => 用空库((r) => { 存状态(r, 'channel-map', { 版本: 1, 记录: [{ 端点: { 渠道: 'fake', 账号: 'fixture' }, 会话: { 类型: 'private', 编号: 'fixture' }, 发送者编号: 'owner', 内部对话编号: 'invalid-id' }] }, 'fake'); assert.throws(() => 备(r)) }))
测('schema破坏和外层事务不能发布半快照', () => 用空库((r) => { const { db } = 内部备份测试(r); db.exec('BEGIN'); assert.throws(() => 备(r), { message: 'SQLITE_CONTEXT_NESTED_FORBIDDEN' }); db.exec('ROLLBACK'); db.exec('DROP TABLE memory_evidence'); assert.throws(() => 备(r), { message: 'SQLITE_BACKUP_SCHEMA_MISMATCH' }) }))
测('备份提交结果不确定时封闭能力，不返回包', () => 用空库((r) => {
  const { db } = 内部备份测试(r), 原 = db.exec
  db.exec = function (sql) { const 回 = 原.call(this, sql); if (sql === 'COMMIT') throw Error('injected'); return 回 }
  try { assert.throws(() => 备(r), { message: 'SQLITE_CONTEXT_COMMIT_UNKNOWN' }); assert.equal(r.取状态().可用, false); assert.throws(() => 备(r), { message: 'SQLITE_CONTEXT_UNUSABLE' }) } finally { db.exec = 原 }
}))
测('路径穿越/绝对路径/设备名/ADS/尾空格均拒绝', () => { for (const p of ['../a', '/a', 'C:/x', 'a\\b', 'a//b', 'a/./b', 'a/CON.txt', 'a/lpt1', 'a/x:ads', 'a/x.', 'a/x ', 'a/\nx']) assert.throws(() => 相对路径(p)); assert.equal(相对路径('data/附件/中文.bin'), 'data/附件/中文.bin') })
测('实际发布原格式包并核对附件字节、每文件哈希和原读取器', () => 用场景((s) => {
  原文基线(s); s.改动(); const 包 = s.备份(), 回 = 写入隔离回退(包, 备份范围); 根们.push(回.根)
  assert.equal(fs.existsSync(path.join(回.根, 'staging')), false)
  const 清单 = JSON.parse(fs.readFileSync(path.join(回.目录, 'migration/manifest.json')))
  for (const 一 of 清单.文件) { const b = fs.readFileSync(path.join(回.目录, 一.路径)); assert.equal(b.length, 一.字节数); assert.equal(哈希(b), 一.sha256) }
  for (const 一 of s.文件) assert.deepEqual(fs.readFileSync(path.join(回.目录, 一.路径)), Buffer.from(一.base64, 'base64'))
  const 输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-rollback-reader.cjs'), 回.目录, s.对话, s.临时], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: path.join(回.目录, 'workspace'), ELYSIA_CONFIG_FILE: path.join(回.根, 'absent.json'), ELYSIA_DATA_DIR: 回.数据目录, ELYSIA_CACHE_DIR: 回.缓存目录 } })
  assert.equal(输出.trim(), 'SQLITE_ROLLBACK_READERS_OK')
  const 私密输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-rollback-reader.cjs'), 回.目录, s.对话, s.临时, 'private'], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: path.join(回.目录, 'workspace'), ELYSIA_CONFIG_FILE: path.join(回.根, 'absent.json'), ELYSIA_DATA_DIR: 回.数据目录, ELYSIA_CACHE_DIR: 回.缓存目录 } })
  assert.equal(私密输出.trim(), 'SQLITE_ROLLBACK_PRIVATE_OK')
}))
测('尚未删除的private原文件可在本机读出，普通日记仍隐藏', () => 用场景((s) => {
  原文基线(s); const 回 = 写入隔离回退(s.备份(), 备份范围); 根们.push(回.根)
  const 输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-rollback-reader.cjs'), 回.目录, s.对话, s.临时, 'before'], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: path.join(回.目录, 'workspace'), ELYSIA_CONFIG_FILE: path.join(回.根, 'absent.json'), ELYSIA_DATA_DIR: 回.数据目录, ELYSIA_CACHE_DIR: 回.缓存目录 } })
  assert.equal(输出.trim(), 'SQLITE_ROLLBACK_BEFORE_OK')
}))
for (const 模式 of ['write', 'fsync', 'rename', 'collision', 'junction']) 测(`文件${模式}失败不发布ready，未覆盖旧目录`, () => 用空库((r) => {
  const 包 = 备(r), 原 = { mkdtempSync: fs.mkdtempSync, writeFileSync: fs.writeFileSync, fsyncSync: fs.fsyncSync, renameSync: fs.renameSync }; let 根
  fs.mkdtempSync = function (...args) { 根 = 原.mkdtempSync(...args); 根们.push(根); if (模式 === 'collision' || 模式 === 'junction') { fs.mkdirSync(path.join(根, 'staging')); if (模式 === 'junction') { fs.rmdirSync(path.join(根, 'staging')); fs.symlinkSync(根们[0], path.join(根, 'staging'), 'junction') } }; return 根 }
  if (模式 === 'write') fs.writeFileSync = () => { throw Error('INJECTED_WRITE') }
  if (模式 === 'fsync') fs.fsyncSync = () => { throw Error('INJECTED_FSYNC') }
  if (模式 === 'rename') fs.renameSync = () => { throw Error('INJECTED_RENAME') }
  try { assert.throws(() => 写入隔离回退(包, 备份范围), { message: 'SQLITE_BACKUP_FILE_WRITE_FAILED' }); assert.ok(根); assert.equal(fs.existsSync(path.join(根, 'ready')), false) }
  finally { Object.assign(fs, 原); if (模式 === 'junction' && 根) { const 链接 = path.join(根, 'staging'); if (fs.existsSync(链接) && fs.lstatSync(链接).isSymbolicLink()) fs.unlinkSync(链接) } }
}))
测('坏包在创建任何目录之前拒绝', () => 用空库((r) => { const 包 = 备(r); 包.指纹 = 'bad'; const 原 = fs.mkdtempSync; fs.mkdtempSync = () => assert.fail('DIRECTORY_CREATED'); try { assert.throws(() => 写入隔离回退(包, 备份范围), { message: 'SQLITE_BACKUP_HASH_MISMATCH' }) } finally { fs.mkdtempSync = 原 } }))
测('发布已生效后异常必须报unknown，不能声称没产生ready', () => 用空库((r) => {
  const 原 = fs.renameSync; fs.renameSync = function (...参数) { 原.apply(this, 参数); throw Error('LOST_ACK') }
  try { assert.throws(() => 写入隔离回退(备(r), 备份范围), (e) => { 根们.push(e.隔离目录); assert.equal(e.message, 'SQLITE_BACKUP_PUBLICATION_UNKNOWN'); assert.equal(e.状态, 'unknown'); assert.equal(fs.existsSync(path.join(e.隔离目录, 'ready/migration/manifest.json')), true); return true }) } finally { fs.renameSync = 原 }
}))
测('读回字节不符不能发布', () => 用空库((r) => {
  const 原读 = fs.readFileSync, 原建 = fs.mkdtempSync; let 根
  fs.mkdtempSync = function (...a) { 根 = 原建.apply(this, a); 根们.push(根); return 根 }
  fs.readFileSync = function (p, ...a) { const b = 原读.call(this, p, ...a); return 根 && String(p).startsWith(path.join(根, 'staging') + path.sep) ? Buffer.from('CORRUPT') : b }
  try { assert.throws(() => 写入隔离回退(备(r), 备份范围), { message: 'SQLITE_BACKUP_FILE_WRITE_FAILED' }); assert.equal(fs.existsSync(path.join(根, 'ready')), false) } finally { fs.readFileSync = 原读; fs.mkdtempSync = 原建 }
}))
测('清单包括持久缓冲及core/main/storage，明确凭据独立', () => { const 一 = 备份范围清单(); for (const p of ['core', 'main', 'storage']) assert.ok(一.源码目录.includes(p)); assert.ok(一.必留缓存.includes('后台缓冲.json')); assert.ok(一.独立秘密.length); 一.SQLite.length = 0; assert.ok(备份范围清单().SQLite.length) })
测('独立子进程阻断配置/业务文件/网络仍可快照与恢复', () => { assert.equal(execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-backup-audit.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim(), 'SQLITE_BACKUP_AUDIT_OK') })
;(async () => { let 过 = 0; try { for (const [名, 做] of 测试) { try { await 做(); 过++; console.log('PASS ' + 名) } catch (e) { console.error('FAIL ' + 名 + '\n' + e.stack) } }; console.log(`SQLite S-15E: ${过}/${测试.length}; synthetic only`); if (过 !== 测试.length) process.exitCode = 1 } finally { for (const 根 of [...根们].reverse()) { const 真 = fs.realpathSync(根); assert.equal(path.dirname(真).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(真).startsWith('elysia-sqlite-E-')); fs.rmSync(真, { recursive: true, force: true }) } } })()
