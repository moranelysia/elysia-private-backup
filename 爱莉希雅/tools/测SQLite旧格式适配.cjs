'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process')
const { 创建隔离仓储, 恢复隔离仓储, 内部备份测试, 备份范围 } = require('../storage/sqlite-backup.cjs'), { 旧格式范围 } = require('../storage/sqlite-legacy.cjs')
const { 写入隔离回退 } = require('../storage/rollback-files.cjs')
const 时间 = '2026-10-26T00:00:00.000Z', 克隆 = (x) => JSON.parse(JSON.stringify(x)), 测试 = [], 测 = (n, f) => 测试.push([n, f])
function 样本() {
  const 行 = [{ 对话: 'old-chat', 角色: 'user', 时间: '2026-09-01 19:03', 内容: '我喜欢雨后的散步', 未知: { 空值: null, 空串: '' } }, { 对话: 'old-chat', 角色: 'assistant', 时间: '', 内容: '我们一起去吧。' }, { 对话: 'other-chat', 角色: 'user', 时间: '2026-09-01 19:03', 内容: '另一段原文' }, { 角色: 'user', 时间: '', 内容: '没有归属' }, { 对话: 'old-chat', 角色: 'user', 时间: '2026-09-01 19:03', 内容: '我喜欢雨后的散步', 未知: { 空值: null, 空串: '' } }]
  return { 版本: 1, 用途: 旧格式范围.用途, 文档: [
    { 路径: 'data/聊天记录/对话索引.json', 类型: 'conversations', 原文: '\uFEFF' + JSON.stringify([{ 编号: 'old-chat', 建于: '2026-09-01 19:03', 模式: '聊天', 标题: '旧标题', 写长期记忆: true, 原扩展: null }, { 编号: 'other-chat', 建于: null, 写长期记忆: false }]) + '\r\n' },
    { 路径: 'data/聊天记录/聊天记录.jsonl', 类型: 'messages', 原文: '\uFEFF' + 行.map((x, i) => JSON.stringify(x) + (i === 0 ? '\r\n' : '')).join('\r\n') },
    { 路径: 'data/事实.json', 类型: 'facts', 原文: '[{"编号":"old-fact","类别":"事实","内容":"你喜欢雨","时间":"2026-09-01 19:03","未知":null}]\r\n' },
    { 路径: 'data/临时记忆.json', 类型: 'temporary', 原文: '{"版本":1,"未知":"保留","记录":[]}\r\n' },
  ] }
}
function 用库(f, 原 = 样本()) { const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }); try { 仓.旧格式.导入(原, 旧格式范围); return f(仓, 原) } finally { 仓.关闭() } }
const 包 = (仓) => 仓.创建备份({ 时间, 外部文件: [], 必须文件: [] }, 备份范围)
function 新消息(仓, 轮次 = 'new-one') { 仓.会话.登记对话('old-chat', { 建于: 时间, 写长期记忆: true }); const 轮 = { 对话: 'old-chat', 轮次, 用户正文: '新的原话', 回复正文: '新的回复', 接收于: 时间, 完成于: 时间 }; const 回 = 仓.会话.存对话一轮(轮); assert.equal(回.好, true); return { 轮, 回 } }
function 旧页(仓) { return 仓.旧格式.读消息页({ 对话: 'old-chat', 大小: 200 }).消息 }
测('缺编号/轮次/序号不补入原始消息，原时间/缺省/null/扩展不变', () => 用库((仓, 原) => {
  assert.deepEqual(仓.旧格式.导出旧原文(旧格式范围).文档, [...原.文档].sort((a, b) => a.路径 < b.路径 ? -1 : 1))
  const m = 旧页(仓); assert.equal(m.length, 3); assert.match(m[0].内部定位, /^legacy-[a-f0-9]{64}$/u); for (const x of m) for (const k of ['编号', '轮次', '序号']) assert.equal(Object.hasOwn(x.原始, k), false)
  assert.equal(m[0].原始.时间, '2026-09-01 19:03'); assert.equal(m[1].原始.时间, ''); assert.deepEqual(m[0].原始.未知, { 空值: null, 空串: '' }); assert.equal(仓.旧格式.读取对话('old-chat').原始.模式, '聊天')
}))
测('完全相同正文按物理位置区分，空行不抹掉位置', () => 用库((仓) => { const m = 旧页(仓); assert.deepEqual(m[0].原始, m[2].原始); assert.notEqual(m[0].内部定位, m[2].内部定位); assert.deepEqual(m.map((x) => x.文件位置), [0, 2, 5]) }))
测('会话隔离，没有归属的旧行不擅自塞进当前会话', () => 用库((仓) => { assert.equal(仓.旧格式.读消息页({ 对话: 'other-chat' }).消息.length, 1); assert.equal(旧页(仓).some((x) => x.原始.内容 === '没有归属'), false); assert.ok(仓.旧格式.导出旧原文(旧格式范围).文档.find((d) => d.类型 === 'messages').原文.includes('没有归属')) }))
测('同包幂等、不同包拒绝，失败后原档案不变', () => 用库((仓, 原) => { const 第一次 = 仓.旧格式.导入(原, 旧格式范围); assert.equal(第一次.新导入, false); const 改 = 克隆(原); 改.文档[0].原文 += ' '; assert.throws(() => 仓.旧格式.导入(改, 旧格式范围), { message: 'SQLITE_LEGACY_IMPORT_CONFLICT' }); assert.equal(仓.旧格式.核验().好, true) }))
测('跨新旧统一分页保持文件顺序，新轮不挤进旧游标窗口', () => 用库((仓) => {
  新消息(仓); const 首 = 仓.旧格式.读消息页({ 对话: 'old-chat', 大小: 2 }); assert.deepEqual(首.消息.map((x) => x.来源), ['native', 'native']); 新消息(仓, 'new-two')
  const 中 = 仓.旧格式.读消息页({ 对话: 'old-chat', 大小: 2, 游标: 首.下一页 }), 尾 = 仓.旧格式.读消息页({ 对话: 'old-chat', 大小: 2, 游标: 中.下一页 }); assert.equal(中.上界, 5); assert.equal(中.消息.length + 尾.消息.length, 3); assert.equal(尾.下一页, null); assert.equal(旧页(仓).length, 7)
}))
测('游标篡改、跨会话/跨上下文拒绝', () => 用库((仓) => { const p = 仓.旧格式.读消息页({ 对话: 'old-chat', 大小: 1 }); assert.throws(() => 仓.旧格式.读消息页({ 对话: 'other-chat', 游标: p.下一页 })); assert.throws(() => 仓.旧格式.读消息页({ 对话: 'old-chat', 游标: p.下一页 + 'x' })); 用库((另) => assert.throws(() => 另.旧格式.读消息页({ 对话: 'old-chat', 游标: p.下一页 }))) }))
测('仅旧对话存在也可按原用户消息取逐字证据，保留内部定位标识', () => 用库((仓) => {
  const locator = 旧页(仓)[0].内部定位, 回 = 仓.记忆.新增临时({ 操作编号: 'source-a', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨后的散步', 来源消息编号: locator, 依据原文: '喜欢雨后的散步' }); assert.equal(回.好, true)
  const 条 = 仓.记忆.读取临时(回.临时编号).条; assert.equal(条.来源.旧档内部定位, locator); assert.equal(条.来源.消息时间, '2026-09-01 19:03')
  const 评 = 仓.记忆.评估并晋升({ 操作编号: 'score-a', 时间, 预期版本: 1, 编号: 回.临时编号, 消息编号: [locator] }); assert.equal(评.晋升, true); assert.equal(仓.记忆.读取临时(回.临时编号).条.评估账本.证据.length, 1)
}))
测('助手来源、缺时间来源和不存在定位不能伪造依据', () => 用库((仓) => {
  for (const id of [旧页(仓)[1].内部定位, 'legacy-absent']) assert.equal(仓.记忆.新增临时({ 操作编号: 'bad-' + id.slice(-8), 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨', 来源消息编号: id, 依据原文: '雨' }).好, false)
  assert.equal(仓.记忆.取统计().临时数, 0)
}))
测('当前长期开关关闭后不得借旧档开关继续自动提取', () => 用库((仓) => { 仓.会话.登记对话('old-chat', { 建于: 时间, 写长期记忆: false }); const id = 旧页(仓)[0].内部定位; const r = 仓.记忆.新增临时({ 操作编号: 'off', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨', 来源消息编号: id, 依据原文: '雨' }); assert.equal(r.代码, 'SQLITE_MEMORY_SWITCH_OFF') }))
测('原未开启长期记忆的旧对话仍拒绝提取', () => 用库((仓, 原) => { const m = 仓.旧格式.读消息页({ 对话: 'other-chat' }).消息[0]; assert.equal(仓.记忆.新增临时({ 操作编号: 'other', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '另一段', 来源消息编号: m.内部定位, 依据原文: '另一段' }).好, false) }))
测('备份/恢复后的定位稳定、原请求幂等，原文回退无合成字段', () => 用库((仓, 原) => {
  const oldKeys = 旧页(仓).map((x) => x.内部定位), { 轮, 回 } = 新消息(仓), backup = 包(仓), r = 恢复隔离仓储(backup, 备份范围)
  try { assert.deepEqual(旧页(r).filter((x) => x.来源 === 'legacy').map((x) => x.内部定位), oldKeys); assert.deepEqual(r.会话.存对话一轮(轮), 回); assert.deepEqual(包(r), backup); const 文 = backup.文档.find((d) => d.类型 === 'messages').原文; assert.ok(文.startsWith(原.文档.find((d) => d.类型 === 'messages').原文)); assert.equal(文.includes('legacy-'), false); assert.equal(r.核验().好, true) } finally { r.关闭() }
}))
测('旧长期及临时根扩展原样回退，新条目可以追加', () => 用库((仓, 原) => { assert.equal(仓.旧格式.列旧长期()[0].原始.时间, '2026-09-01 19:03'); assert.equal(仓.记忆.新增长期({ 操作编号: 'long-new', 时间, 预期版本: 0, 类别: '经历', 内容: '我们一起听歌' }).好, true); const p = 包(仓); assert.equal(p.文档.find((d) => d.类型 === 'facts').原文, 原.文档.find((d) => d.类型 === 'facts').原文); assert.equal(JSON.parse(p.文档.find((d) => d.类型 === 'temporary').原文).未知, '保留') }))
测('不支持的日记来源拒绝，不能经旧档口绕过private策略', () => 用库((仓) => { const p = 样本(); p.文档.push({ 路径: 'data/日记/私密/x.json', 类型: 'private-diary', 原文: '{}' }); assert.throws(() => 仓.旧格式.导入(p, 旧格式范围), { message: 'SQLITE_LEGACY_SOURCE_UNSUPPORTED' }) }))
测('显式scope/重复来源/重复JSON键/getter均拒绝', () => 用库((仓) => { assert.throws(() => 仓.旧格式.导出旧原文()); const p = 样本(); p.文档.push(p.文档[0]); assert.throws(() => 仓.旧格式.导入(p, 旧格式范围)); const q = 样本(); q.文档[0].原文 = '[{"编号":"a","编号":"b"}]'; assert.throws(() => 仓.旧格式.导入(q, 旧格式范围)); let ran = false; assert.throws(() => 仓.旧格式.读消息页({ get 对话() { ran = true; return 'old-chat' } })); assert.equal(ran, false) }))
测('投影SQL中途失败全量回滚，可原样重试', () => {
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), { db } = 内部备份测试(仓)
  try { db.exec("CREATE TEMP TRIGGER reject_legacy BEFORE INSERT ON legacy_records WHEN NEW.position=2 BEGIN SELECT RAISE(ABORT,'injected'); END"); assert.throws(() => 仓.旧格式.导入(样本(), 旧格式范围)); assert.equal(db.prepare('SELECT count(*) AS n FROM legacy_documents').get().n, 0); db.exec('DROP TRIGGER reject_legacy'); assert.equal(仓.旧格式.导入(样本(), 旧格式范围).好, true) } finally { 仓.关闭() }
})
测('篡改定位/原文/投影拒绝，不能把新内容当原证据', () => 用库((仓) => { const { db } = 内部备份测试(仓); db.exec("UPDATE legacy_records SET payload_json='{}' WHERE kind='messages'"); assert.throws(() => 旧页(仓), { message: 'SQLITE_LEGACY_INTEGRITY_FAILED' }); assert.throws(() => 包(仓)) }))
测('旧元数据只覆盖明确编辑字段，原时间/模式/未知字段仍保留', () => 用库((仓) => { 新消息(仓); assert.equal(仓.会话.更新对话('old-chat', { 预期版本: 1, 标题: '修改' }).好, true); const x = JSON.parse(包(仓).文档.find((d) => d.类型 === 'conversations').原文)[0]; assert.equal(x.标题, '修改'); assert.equal(x.模式, '聊天'); assert.equal(x.建于, '2026-09-01 19:03'); assert.equal(x.原扩展, null); assert.equal(仓.旧格式.列对话()[0].当前.标题, '修改') }))
测('缺省/null时间仍可原文保全，但旧读取器不兼容时阻止发布回退', () => {
  const p = 样本(); const doc = p.文档.find((d) => d.类型 === 'messages'); doc.原文 = JSON.stringify({ 对话: 'old-chat', 角色: 'user', 时间: null, 内容: '原字段不猜补' })
  用库((仓) => { assert.equal(旧页(仓)[0].原始.时间, null); assert.equal(仓.旧格式.导出旧原文(旧格式范围).文档.find((d) => d.类型 === 'messages').原文, doc.原文); assert.throws(() => 包(仓), { message: 'SQLITE_LEGACY_OLD_READER_INCOMPATIBLE' }) }, p)
})
测('多次元数据改动及恢复保留覆盖链，备份后仍能再编辑', () => 用库((仓) => {
  新消息(仓); 仓.会话.更新对话('old-chat', { 预期版本: 1, 标题: '改标题' }); assert.equal(仓.会话.更新对话('old-chat', { 预期版本: 2, 写长期记忆: false }).好, true)
  const r = 恢复隔离仓储(包(仓), 备份范围)
  try { assert.equal(r.旧格式.列对话()[0].当前.标题, '改标题'); assert.equal(r.会话.更新对话('old-chat', { 预期版本: 3, 模型: 'new-model' }).好, true); const x = JSON.parse(包(r).文档.find((d) => d.类型 === 'conversations').原文)[0]; assert.equal(x.标题, '改标题'); assert.equal(x.写长期记忆, false); assert.equal(x.模型, 'new-model'); assert.equal(x.模式, '聊天') } finally { r.关闭() }
}))
测('覆盖字段存储失败时B元数据和旧字段覆盖一起回滚', () => 用库((仓) => {
  新消息(仓); const { db } = 内部备份测试(仓); db.exec("CREATE TEMP TRIGGER reject_patch BEFORE INSERT ON repository_meta WHEN NEW.key GLOB 'legacy_patch_*' BEGIN SELECT RAISE(ABORT,'injected'); END")
  assert.equal(仓.会话.更新对话('old-chat', { 预期版本: 1, 标题: '不能留下' }).好, false); assert.equal(仓.会话.读取对话('old-chat').元数据版本, 1); assert.equal(仓.旧格式.列对话()[0].当前.标题, '旧标题'); assert.equal(db.prepare("SELECT count(*) AS n FROM repository_meta WHERE key GLOB 'legacy_patch_*'").get().n, 0)
}))
测('无效分页参数、关闭能力及损坏schema均拒绝', () => 用库((仓) => {
  for (const x of [{ 对话: 'old-chat', 大小: 0 }, { 对话: 'old-chat', 大小: 201 }, { 对话: 'old-chat', 游标: '' }, { 对话: 'old-chat', 游标: false }]) assert.throws(() => 仓.旧格式.读消息页(x))
  const { db } = 内部备份测试(仓); db.exec('DROP TABLE legacy_records'); assert.throws(() => 旧页(仓), { message: 'SQLITE_LEGACY_SCHEMA_INVALID' }); 仓.关闭(); assert.throws(() => 旧页(仓), { message: 'SQLITE_CONTEXT_CLOSED' })
}))
测('坏覆盖记录不能借后续编辑悄悄修复', () => 用库((仓) => {
  新消息(仓); 仓.会话.更新对话('old-chat', { 预期版本: 1, 标题: '改过' }); 内部备份测试(仓).db.exec("UPDATE repository_meta SET value='{}' WHERE key GLOB 'legacy_patch_*'")
  assert.equal(仓.会话.更新对话('old-chat', { 预期版本: 2, 标题: '新标题' }).好, false); assert.throws(() => 包(仓), { message: 'SQLITE_LEGACY_INTEGRITY_FAILED' })
}))
测('导入提交回执丢失封闭共享能力，不假称可重试', () => {
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), { db } = 内部备份测试(仓), 原 = db.exec
  db.exec = function (sql) { const x = 原.call(this, sql); if (sql === 'COMMIT') throw Error('injected'); return x }
  try { assert.throws(() => 仓.旧格式.导入(样本(), 旧格式范围), { message: 'SQLITE_CONTEXT_COMMIT_UNKNOWN' }); assert.equal(仓.取状态().可用, false); assert.throws(() => 旧页(仓), { message: 'SQLITE_CONTEXT_UNUSABLE' }) } finally { db.exec = 原; 仓.关闭() }
})
测('没有文件/配置/网络访问也能导入旧档并查询', () => {
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), keys = ['readFileSync', 'writeFileSync', 'openSync', 'mkdirSync', 'renameSync'], 原 = Object.fromEntries(keys.map((k) => [k, fs[k]])), oldFetch = global.fetch
  for (const k of keys) fs[k] = () => assert.fail('FILE_FORBIDDEN'); global.fetch = () => assert.fail('NETWORK_FORBIDDEN')
  try { assert.equal(仓.旧格式.导入(样本(), 旧格式范围).好, true); assert.equal(旧页(仓).length, 3); assert.equal(包(仓).版本, 2) } finally { Object.assign(fs, 原); global.fetch = oldFetch; 仓.关闭() }
})
测('旧候选备份版本不自动补空旧档表', () => 用库((仓) => {
  const { createHash } = require('node:crypto'), p = 包(仓); p.版本 = 1; const { 指纹, ...c } = p; p.指纹 = createHash('sha256').update(JSON.stringify(c)).digest('hex'); assert.throws(() => 恢复隔离仓储(p, 备份范围), { message: 'SQLITE_BACKUP_VERSION_UNSUPPORTED' })
}))
测('真实临时文件回退由原JSON读取器读到旧+新且没有内部键', () => 用库((仓) => {
  新消息(仓); const out = 写入隔离回退(包(仓), 备份范围)
  try {
    const script = "const a=require('node:assert/strict');const m=require('./脑/记忆.cjs');const r=m.读聊天记录(0,{对话:'old-chat'});a.equal(r.length,5);a.equal(r[0].时间,'2026-09-01 19:03');a.equal(Object.hasOwn(r[0],'编号'),false);a.equal(m.对话列表().find(x=>x.编号==='old-chat').标题,'旧标题');process.stdout.write('OLD_READER_OK')"
    assert.equal(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: out.根, ELYSIA_CONFIG_FILE: path.join(out.根, 'absent.json'), ELYSIA_DATA_DIR: out.数据目录, ELYSIA_CACHE_DIR: out.缓存目录 } }), 'OLD_READER_OK')
  } finally { const real = fs.realpathSync(out.根); assert.equal(path.dirname(real).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(real).startsWith('elysia-sqlite-E-')); fs.rmSync(real, { recursive: true, force: true }) }
}))
;(async () => { let pass = 0; for (const [n, f] of 测试) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n + '\n' + e.stack) } }; console.log(`SQLite S-15F2: ${pass}/${测试.length}; isolated legacy adapter only`); if (pass !== 测试.length) process.exitCode = 1 })()
