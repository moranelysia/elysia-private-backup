'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
const { 创建隔离仓储, 恢复隔离仓储, 内部备份测试, 备份范围 } = require('../storage/sqlite-backup.cjs')
const { 旧格式范围 } = require('../storage/sqlite-legacy.cjs'), { 写入隔离回退 } = require('../storage/rollback-files.cjs')
const { 创建临时记忆状态 } = require('../脑/临时记忆状态.cjs')
const 时间 = '2026-10-26T00:00:00.000Z', 拷 = (x) => JSON.parse(JSON.stringify(x)), 测试 = [], 测 = (n, f) => 测试.push([n, f])
function 样本() {
  let 数据 = { 版本: 1, 根扩展: { 空: null, 字: '' }, 记录: [] }, 序 = 0
  const 库 = 创建临时记忆状态({ 文件: ':memory:', 现在: () => new Date(时间), 新编号: () => 'temp-' + (++序), 读数据: () => 拷(数据), 写数据: (x) => { 数据 = 拷(x) } })
  for (const 正文 of ['你喜欢听雨', '你正在学画画', '我们一起看过晚霞']) 库.新增('候选偏好', 正文, { 提取方式: '手动', 创建于: 时间 })
  库.提议晋升('temp-3', '经历'); 库.决定晋升('temp-3', true); 库.完成晋升('temp-3', 'long-promoted')
  数据.记录[0].创建于 = '2026-09-01 19:03'; 数据.记录[0].到期于 = '2026-11-02 19:03'; 数据.记录[0].扩展 = { 原值: null }
  数据.记录[1].生命周期 = '已归档'; 数据.记录[1].归档于 = '2026-09-03 19:03'
  数据.记录[0].评估账本 = { 证据: [{ 指纹: 'historical-evidence', 消息时间: '2026-09-01 19:03', 依据原文: '喜欢听雨', 未知: '' }], 评估历史: [{ 分数: 12, 未知: null }] }
  const 长 = [
    { 编号: 'long-fact', 类别: '事实', 内容: '用户喜欢听雨', 时间: '2026-09-01 19:03', 来源: '旧记录', 扩展: { 空: null, 字: '' } },
    { 编号: 'long-second', 类别: '事实', 内容: '你喜欢画画', 时间: null, 来源: '我' },
  ]
  const 档 = (路径, 类型, 值) => ({ 路径, 类型, 原文: '\uFEFF' + JSON.stringify(值) + '\r\n' })
  return { 版本: 1, 用途: 旧格式范围.用途, 文档: [档('data/事实.json', 'facts', 长), 档('data/经历.json', 'episodes', [{ 编号: 'long-promoted', 类别: '经历', 内容: '我们一起看过晚霞', 时间: '', 临时记忆: 'temp-3', 来源: '我' }]), 档('data/小本子.json', 'notebook', []), 档('data/临时记忆.json', 'temporary', 数据)] }
}
function 用库(f, { 改源, 绑定 = true } = {}) {
  const 仓 = 创建隔离仓储({ 用途: 'synthetic-sqlite-repository' }), 原 = 样本(); if (改源) 改源(原)
  try {
    仓.旧格式.导入(原, 旧格式范围); if (绑定) assert.equal(仓.旧格式.接入旧记忆(旧格式范围).好, true)
    let 序 = 0
    const 调 = (方法, 参数) => 仓.记忆[方法]({ 操作编号: 'edit-' + (++序), 时间, 预期版本: 仓.记忆.取统计().版本, ...参数 })
    return f(仓, 原, 调, 内部备份测试(仓).db)
  } finally { 仓.关闭() }
}
const 备 = (仓) => 仓.创建备份({ 时间, 外部文件: [], 必须文件: [] }, 备份范围)
const 原格式 = (仓) => 仓.导出原格式(备份范围).文档
const 文 = (包, 路径) => 包.find((x) => x.路径 === 路径)
function 改文(原, 路径, f) { const d = 文(原.文档, 路径), x = JSON.parse(d.原文.replace(/^\uFEFF/u, '')); f(x); d.原文 = JSON.stringify(x) }
测('原记录进入C同库，旧时间/未知/null/口吻逐字保存且不产生评分或操作', () => 用库((仓, 原, 调, db) => {
  assert.equal(仓.记忆.取统计().长期数, 3); assert.equal(仓.记忆.取统计().临时数, 3); assert.equal(仓.记忆.取统计().操作数, 0); assert.equal(仓.记忆.取统计().版本, 0)
  assert.equal(仓.记忆.列长期().列表[0].内容, '用户喜欢听雨'); assert.equal(仓.核验().好, true)
  for (const d of 原.文档) assert.equal(文(原格式(仓), d.路径).原文, d.原文)
  assert.equal(db.prepare('SELECT record_json FROM memory_temporary WHERE memory_id=?').get('temp-1').record_json, JSON.stringify(JSON.parse(文(原.文档, 'data/临时记忆.json').原文.replace(/^\uFEFF/u, '')).记录[0]))
}))
测('接入幂等，经过编辑后再接入也不覆盖当前状态或版本', () => 用库((仓, 原, 调) => {
  assert.equal(调('人工修改长期', { 类别: '事实', 编号: 'long-fact', 内容: '你喜欢雨声' }).好, true)
  assert.equal(仓.旧格式.接入旧记忆(旧格式范围).新接入, false); assert.equal(仓.记忆.列长期().列表[0].内容, '你喜欢雨声'); assert.equal(仓.记忆.取统计().版本, 1)
}))
测('旧三类全局次序沿用事实/经历/小本子，每类内部沿用文件顺序而非猜测时间', () => 用库((仓) => {
  assert.deepEqual(仓.记忆.列长期().列表.map((x) => x.编号), ['long-fact','long-second','long-promoted','old-note'])
}, { 改源: (原) => 改文(原, 'data/小本子.json', (a) => a.push({ 编号: 'old-note', 类别: '小本子', 内容: '我们先列清单再动手', 时间: '1990-01-01' })) }))
测('明确编辑改用你我视角并保留原时间、来源、扩展及旧原文档', () => 用库((仓, 原, 调) => {
  assert.equal(调('人工修改长期', { 类别: '事实', 编号: 'long-fact', 内容: '用户喜欢安静的雨声' }).好, true)
  const x = 仓.记忆.列长期().列表[0]; assert.equal(x.内容, '你喜欢安静的雨声'); assert.equal(x.时间, '2026-09-01 19:03'); assert.equal(x.来源, '旧记录'); assert.deepEqual(x.扩展, { 空: null, 字: '' }); assert.equal(x.修改于, 时间)
  assert.deepEqual(仓.旧格式.导出旧原文(旧格式范围).文档, [...原.文档].sort((a, b) => a.路径 < b.路径 ? -1 : 1))
}))
测('删除旧长期并新增后只回退当前数据，原文件顺序和未动文档字节保留', () => 用库((仓, 原, 调) => {
  assert.equal(调('人工遗忘长期', { 类别: '事实', 编号: 'long-fact' }).好, true)
  const 回 = 调('新增长期', { 类别: '事实', 内容: '你喜欢晴天' }); assert.equal(回.好, true)
  const docs = 原格式(仓), a = JSON.parse(文(docs, 'data/事实.json').原文); assert.deepEqual(a.map((x) => x.编号), ['long-second', 回.目标编号]); assert.equal(a[0].时间, null)
  assert.equal(文(docs, 'data/经历.json').原文, 文(原.文档, 'data/经历.json').原文); assert.equal(仓.核验().好, true)
}))
测('旧临时的修改/删除保留根扩展与原日期，证据和评估历史同库', () => 用库((仓, 原, 调) => {
  assert.equal(仓.记忆.取统计().证据数, 1); assert.equal(仓.记忆.取统计().历史数, 1)
  assert.equal(调('人工处理临时', { 动作: '修改', 参数: ['temp-1', { 内容: '你喜欢雨夜' }] }).好, true)
  assert.equal(调('人工处理临时', { 动作: '删除', 参数: ['temp-2'] }).好, true)
  const x = JSON.parse(文(原格式(仓), 'data/临时记忆.json').原文); assert.deepEqual(x.根扩展, { 空: null, 字: '' }); assert.deepEqual(x.记录.map((x) => x.编号), ['temp-1','temp-3']); assert.equal(x.记录[0].创建于, '2026-09-01 19:03'); assert.equal(x.记录[0].到期于, '2026-11-02 19:03'); assert.equal(x.记录[0].内容, '你喜欢雨夜')
  assert.equal(仓.核验().好, true)
}))
测('归档旧临时可按原规则恢复，恢复不是重新生成记录', () => 用库((仓, 原, 调) => {
  assert.equal(调('人工处理临时', { 动作: '恢复', 参数: ['temp-2', 2] }).好, true); const x = 仓.记忆.读取临时('temp-2').条; assert.equal(x.编号, 'temp-2'); assert.equal(x.生命周期, '有效'); assert.equal(x.内容, '你正在学画画'); assert.equal(仓.记忆.取统计().临时数, 3)
}))
测('旧已晋升关系重放幂等，删除目标后禁止复活', () => 用库((仓, 原, 调) => {
  const 回 = 调('人工确认晋升', { 编号: 'temp-3', 去向: '经历' }); assert.equal(回.目标编号, 'long-promoted'); assert.equal(仓.记忆.取统计().长期数, 3)
  assert.equal(调('人工遗忘长期', { 类别: '经历', 编号: 'long-promoted' }).好, true)
  assert.equal(调('人工确认晋升', { 编号: 'temp-3', 去向: '经历' }).代码, 'SQLITE_MEMORY_TARGET_FORGOTTEN'); assert.equal(仓.核验().好, true); assert.equal(JSON.parse(文(原格式(仓), 'data/经历.json').原文).length, 0)
}))
测('旧有效临时可人工晋升，新目标和旧状态标记同事务', () => 用库((仓, 原, 调) => {
  const 回 = 调('人工确认晋升', { 编号: 'temp-1', 去向: '事实' }); assert.equal(回.好, true); assert.equal(仓.记忆.读取临时('temp-1').条.晋升.目标编号, 回.目标编号); assert.equal(仓.核验().好, true)
}))
测('备份v3恢复保持删除、改动、历史来源和操作幂等，再接入不重建', () => 用库((仓, 原, 调) => {
  调('人工遗忘长期', { 类别: '事实', 编号: 'long-fact' }); 调('人工处理临时', { 动作: '删除', 参数: ['temp-2'] }); const b = 备(仓); assert.equal(b.版本, 3)
  const r = 恢复隔离仓储(b, 备份范围); try { assert.equal(r.旧格式.接入旧记忆(旧格式范围).新接入, false); assert.equal(r.记忆.列长期().列表.length, 2); assert.equal(r.记忆.读取临时('temp-2').条, null); assert.deepEqual(原格式(r), 原格式(仓)); assert.equal(r.记忆.人工遗忘长期({ 操作编号: 'edit-1', 时间, 预期版本: 0, 类别: '事实', 编号: 'long-fact' }).好, true); assert.equal(r.记忆.取统计().版本, 2) } finally { r.关闭() }
}))
测('v3不能改版本冒充旧追加模式的v2备份', () => 用库((仓) => {
  const b = 备(仓); b.版本 = 2; const { 指纹, ...c } = b; b.指纹 = createHash('sha256').update(JSON.stringify(c)).digest('hex'); assert.throws(() => 恢复隔离仓储(b, 备份范围), { message: 'SQLITE_BACKUP_VERSION_UNSUPPORTED' })
}))
for (const [名, 改] of [
  ['缺稳定编号', (x) => { delete x[0].编号 }], ['非法可操作编号', (x) => { x[0].编号 = '旧中文编号' }], ['来源类别不符', (x) => { x[0].类别 = '经历' }], ['临时关联悬空', (x) => { x[0].临时记忆 = 'missing' }],
]) 测(名 + '拒绝接入，不补身份或丢记录；失败后保留原档且无半写入', () => 用库((仓, 原, 调, db) => {
  assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围)); assert.equal(仓.记忆.取统计().长期数, 0); assert.equal(仓.记忆.取统计().临时数, 0); assert.equal(db.prepare("SELECT 1 FROM repository_meta WHERE key='legacy_memory_binding'").get(), undefined); assert.equal(仓.旧格式.核验().好, true)
}, { 绑定: false, 改源: (x) => 改文(x, 'data/事实.json', 改) }))
测('坏临时状态和重复证据投影拒绝，全量回滚', () => {
  for (const 改 of [(x) => { x.记录[0].生命周期 = '未知' }, (x) => { x.记录[0].评估账本.证据.push(拷(x.记录[0].评估账本.证据[0])) }]) 用库((仓) => { assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围)); assert.equal(仓.记忆.取统计().长期数, 0); assert.equal(仓.记忆.取统计().临时数, 0) }, { 绑定: false, 改源: (x) => 改文(x, 'data/临时记忆.json', 改) })
})
测('SQL中途失败回滚所有表和接入标记，可原样重试', () => 用库((仓, 原, 调, db) => {
  db.exec("CREATE TEMP TRIGGER fail_binding BEFORE INSERT ON memory_evidence BEGIN SELECT RAISE(ABORT,'injected'); END")
  assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围)); assert.equal(仓.记忆.取统计().长期数, 0); assert.equal(仓.记忆.取统计().临时数, 0)
  db.exec('DROP TRIGGER fail_binding'); assert.equal(仓.旧格式.接入旧记忆(旧格式范围).记录数, 6); assert.equal(仓.核验().好, true)
}, { 绑定: false }))
测('有新增业务时拒绝在后方偷偷覆盖或补接旧状态', () => 用库((仓, 原, 调) => {
  assert.equal(调('新增长期', { 类别: '事实', 内容: '你喜欢小提琴' }).好, true); assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围), { message: 'SQLITE_LEGACY_MEMORY_NOT_EMPTY' }); assert.equal(仓.记忆.取统计().长期数, 1)
}, { 绑定: false }))
测('接入范围/getter/关闭能力都不能触发写入', () => 用库((仓) => {
  assert.throws(() => 仓.旧格式.接入旧记忆({ 用途: 旧格式范围.用途, 包含私密: false })); assert.throws(() => 仓.旧格式.接入旧记忆({ get 用途() { assert.fail('GETTER_CALLED') }, 包含私密: true })); 仓.关闭(); assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围))
}, { 绑定: false }))
测('旧口吻例外仅限原编号原文，新插入或改坏正文仍拒绝', () => 用库((仓, 原, 调, db) => {
  db.prepare('UPDATE memory_long SET record_json=json_set(record_json,?,?) WHERE memory_id=?').run('$.内容', '用户喜欢被篡改的内容', 'long-fact'); assert.throws(() => 仓.核验(), { message: 'SQLITE_MEMORY_INTEGRITY_FAILED' })
}))
测('旧口吻例外不适用于新编号，新业务仍自动转成你我视角', () => 用库((仓, 原, 调, db) => {
  const 回 = 调('新增长期', { 类别: '事实', 内容: '用户喜欢听雨' }); assert.equal(回.好, true); assert.equal(仓.记忆.列长期().列表.find((x) => x.编号 === 回.目标编号).内容, '你喜欢听雨')
  db.prepare('UPDATE memory_long SET record_json=json_set(record_json,?,?) WHERE memory_id=?').run('$.内容', '用户喜欢听雨', 回.目标编号); assert.throws(() => 仓.核验(), { message: 'SQLITE_MEMORY_INTEGRITY_FAILED' })
}))
测('删除旧临时级联清理证据投影，墓碑保留关联且备份恢复不重建', () => 用库((仓, 原, 调) => {
  assert.equal(调('人工处理临时', { 动作: '删除', 参数: ['temp-1'] }).好, true); assert.equal(仓.记忆.取统计().证据数, 0); assert.equal(仓.记忆.取统计().历史数, 0)
  const r = 恢复隔离仓储(备(仓), 备份范围); try { r.旧格式.接入旧记忆(旧格式范围); assert.equal(r.记忆.读取临时('temp-1').条, null); assert.equal(r.核验().好, true) } finally { r.关闭() }
}))
测('阻断文件和网络后仍能接入及编辑，候选模块没有访问正式目录', () => 用库((仓, 原, 调) => {
  const oldFetch = global.fetch, 原读 = fs.readFileSync, 原写 = fs.writeFileSync
  try { global.fetch = fs.readFileSync = fs.writeFileSync = () => assert.fail('EXTERNAL_IO'); assert.equal(仓.旧格式.接入旧记忆(旧格式范围).好, true); assert.equal(调('人工修改长期', { 类别: '事实', 编号: 'long-fact', 内容: '你喜欢听小雨' }).好, true); assert.equal(备(仓).版本, 3) }
  finally { global.fetch = oldFetch; fs.readFileSync = 原读; fs.writeFileSync = 原写 }
}, { 绑定: false }))
测('接入标记损坏/丢失或旧记录无墓碑消失，不静默重导而复活', () => {
  for (const sql of ["UPDATE repository_meta SET value='bad' WHERE key='legacy_memory_binding'", "DELETE FROM repository_meta WHERE key='legacy_memory_binding'", "DELETE FROM memory_long WHERE memory_id='long-fact'"]) 用库((仓, 原, 调, db) => { db.exec(sql); assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围), { message: 'SQLITE_LEGACY_MEMORY_BINDING_INVALID' }); assert.throws(() => 备(仓)) })
})
测('旧编辑或删除SQL失败保持当前记录、版本和完整回退文档', () => 用库((仓, 原, 调, db) => {
  const 前 = 原格式(仓); db.exec("CREATE TEMP TRIGGER fail_delete BEFORE INSERT ON memory_long_deleted BEGIN SELECT RAISE(ABORT,'injected'); END")
  assert.equal(调('人工遗忘长期', { 类别: '事实', 编号: 'long-fact' }).好, false); assert.equal(仓.记忆.取统计().版本, 0); assert.deepEqual(原格式(仓), 前)
}))
测('提交回执丢失封闭共享能力，不能再次接入掩盖未知结果', () => 用库((仓, 原, 调, db) => {
  const 原exec = db.exec.bind(db); db.exec = (sql) => { const r = 原exec(sql); if (sql === 'COMMIT') throw Error('lost commit'); return r }
  assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围), { message: 'SQLITE_CONTEXT_COMMIT_UNKNOWN' }); assert.equal(仓.取状态().可用, false); assert.throws(() => 仓.旧格式.接入旧记忆(旧格式范围), { message: 'SQLITE_CONTEXT_UNUSABLE' })
}, { 绑定: false }))
测('真实隔离回退目录由旧JSON长期/临时读取器读回编辑与删除', () => 用库((仓, 原, 调) => {
  调('人工修改长期', { 类别: '事实', 编号: 'long-fact', 内容: '你喜欢雨夜' }); 调('人工遗忘长期', { 类别: '事实', 编号: 'long-second' }); 调('人工处理临时', { 动作: '删除', 参数: ['temp-2'] })
  const out = 写入隔离回退(备(仓), 备份范围)
  try {
    const code = "const a=require('node:assert/strict'),m=require('./脑/记忆.cjs'),t=require('./脑/临时记忆.cjs');const l=m.全部长期记忆();a.equal(l.length,2);a.equal(l.find(x=>x.编号==='long-fact').内容,'你喜欢雨夜');a.equal(l.find(x=>x.编号==='long-fact').时间,'2026-09-01 19:03');a.equal(t.取一条('temp-2'),null);a.equal(t.取一条('temp-3').晋升.目标编号,'long-promoted');process.stdout.write('LEGACY_MEMORY_READERS_OK')"
    assert.equal(execFileSync(process.execPath, ['-e', code], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: out.根, ELYSIA_CONFIG_FILE: path.join(out.根, 'absent.json'), ELYSIA_DATA_DIR: out.数据目录, ELYSIA_CACHE_DIR: out.缓存目录 } }), 'LEGACY_MEMORY_READERS_OK')
  } finally { const p = fs.realpathSync(out.根); assert.equal(path.dirname(p).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(p).startsWith('elysia-sqlite-E-')); fs.rmSync(p, { recursive: true, force: true }) }
}))
;(async () => { let pass = 0; for (const [n, f] of 测试) { try { await f(); pass++; console.log('PASS ' + n) } catch (e) { console.error('FAIL ' + n + '\n' + e.stack) } } console.log(`SQLite S-15F3A: ${pass}/${测试.length}; isolated mutable legacy memory only`); if (pass !== 测试.length) process.exitCode = 1 })()
