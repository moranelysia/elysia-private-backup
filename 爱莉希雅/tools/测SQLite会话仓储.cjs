'use strict'
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const { 创建内存上下文, 取内部, 原子执行 } = require('../storage/sqlite-context.cjs')
const { 创建会话仓储, 内部事务存轮 } = require('../storage/sqlite-chat.cjs')
const 时间 = '2026-10-25T00:00:00.000Z', 范围 = { 用途: 'synthetic-sqlite-repository' }
const 测试 = []
const 测 = (名, 做) => 测试.push([名, 做])
function 轮(号 = 't-01', 对话 = 'chat-a', 其他 = {}) { return { 对话, 轮次: 号, 用户正文: '雨停了，一起走走吧 🌸', 回复正文: '好呀，我陪你。', 发生于: null, 接收于: 时间, 完成于: '2026-10-25T00:00:01.000Z', ...其他 } }
async function 用库(做, 注册 = true) {
  const ctx = 创建内存上下文(范围)
  try { const 库 = 创建会话仓储(ctx); if (注册) assert.equal(库.登记对话('chat-a', { 建于: 时间 }).好, true); await 做({ ctx, 库, db: 取内部(ctx).db }) }
  finally { ctx.关闭() }
}
function 成功(库, 一 = 轮()) { const 回 = 库.存对话一轮(一); assert.equal(回.好, true); return 回 }
测('内部轮次能力仅允许已初始化上下文的原子事务', () => 用库(({ ctx, 库, db }) => {
  assert.throws(() => 内部事务存轮({}, 轮()), { message: 'SQLITE_CHAT_TRANSACTION_CAPABILITY_REQUIRED' })
  assert.throws(() => 内部事务存轮(ctx, 轮()), { message: 'SQLITE_CHAT_TRANSACTION_REQUIRED' })
  db.exec('BEGIN IMMEDIATE'); try { assert.throws(() => 内部事务存轮(ctx, 轮()), { message: 'SQLITE_CHAT_TRANSACTION_REQUIRED' }) } finally { db.exec('ROLLBACK') }
  assert.equal(库.取统计().轮次数, 0)
  const 回 = 原子执行(ctx, () => 内部事务存轮(ctx, 轮())); assert.equal(回.好, true); assert.deepEqual(成功(库), 回); assert.equal(库.核验().好, true)
}))
测('内部轮次跟随外层事务回滚，之后原轮次可重试', () => 用库(({ ctx, 库 }) => {
  assert.throws(() => 原子执行(ctx, () => { 内部事务存轮(ctx, 轮()); throw Error('synthetic-later-failure') }), { message: 'SQLITE_CONTEXT_TRANSACTION_FAILED' })
  assert.deepEqual(库.取统计(), { 会话数: 1, 消息数: 0, 轮次数: 0 }); const 回 = 成功(库); assert.equal(回.起序, 1); assert.equal(库.核验().好, true)
}))
测('内部轮次复用原校验与冲突规则且不嵌套提交', () => 用库(({ ctx, 库 }) => {
  assert.throws(() => 原子执行(ctx, () => 内部事务存轮(ctx, 轮('bad', 'chat-a', { 回复正文: null }))), { message: 'SQLITE_CHAT_INPUT_INVALID' })
  const first = 成功(库); assert.deepEqual(原子执行(ctx, () => 内部事务存轮(ctx, 轮())), first)
  assert.throws(() => 原子执行(ctx, () => 内部事务存轮(ctx, 轮('t-01', 'chat-a', { 回复正文: '冲突' }))), { message: 'SQLITE_CHAT_TURN_CONFLICT' }); assert.equal(库.取统计().轮次数, 1); assert.equal(库.核验().好, true)
}))
const 输入错 = { message: 'SQLITE_CHAT_INPUT_INVALID' }
测('内存能力必须显式申请；拒绝路径/伪造能力/getter', () => {
  for (const 值 of [undefined, {}, { ...范围, 文件: 'not-used.sqlite' }, { 用途: 'production' }]) assert.throws(() => 创建内存上下文(值), { message: 'SQLITE_CONTEXT_SCOPE_REQUIRED' })
  let 执行 = false; assert.throws(() => 创建内存上下文({ get 用途() { 执行 = true; return 范围.用途 } })); assert.equal(执行, false)
  assert.throws(() => 创建会话仓储({}), { message: 'SQLITE_CONTEXT_REQUIRED' })
})
测('同一能力多仓储句柄共享数据，初始化不重建', () => 用库(({ ctx, 库 }) => {
  const 新 = 创建会话仓储(ctx); 成功(库); assert.equal(新.取统计().消息数, 2); assert.equal(新.核验().好, true)
}))
测('空对话可列出；元数据/扩展及Node默认记忆开关保留', () => 用库(({ 库 }) => {
  const 回 = 库.登记对话('chat-b', { 建于: 时间, 标题: '一场雨', 模型: 'fixture-model', 模式: 'work', 写长期记忆: true, 扩展: { 未知字段: { 空串: '', 空值: null } } })
  assert.equal(回.新建, true); const 段 = 库.读取对话('chat-b')
  assert.equal(段.条数, 0); assert.equal(段.模式, 'work'); assert.equal(段.写长期记忆, true); assert.equal(库.读取对话('chat-a').写长期记忆, false)
  assert.deepEqual(段.扩展, { 未知字段: { 空串: '', 空值: null } }); assert.deepEqual(库.列对话({ 上限: 1 }).对话们.map((一) => 一.编号), ['chat-b']); assert.equal(库.列对话({ 上限: 1 }).还有, true)
}))
测('必须显式对话编号，没有当前会话回退', () => 用库(({ 库 }) => {
  成功(库)
  for (const 号 of [undefined, null, '', 1, '../chat-a', 'chat-a\n']) {
    assert.equal(库.登记对话(号, { 建于: 时间 }).好, false); assert.equal(库.存对话一轮({ ...轮('t-02'), 对话: 号 }).好, false)
    assert.throws(() => 库.读最近聊天(20, { 对话: 号 }), 输入错); assert.throws(() => 库.读取对话(号), 输入错)
  }
  assert.throws(() => 库.读最近聊天(20), 输入错); assert.equal(库.取统计().消息数, 2)
}))
测('重复登记不覆盖已有模型/开关/创建时间', () => 用库(({ 库 }) => {
  const 回 = 库.登记对话('chat-a', { 建于: '2026-10-25T01:00:00.000Z', 模型: 'new', 写长期记忆: true })
  assert.equal(回.新建, false); const 段 = 库.读取对话('chat-a'); assert.equal(段.建于, 时间); assert.equal(段.模型, ''); assert.equal(段.写长期记忆, false)
}))
测('元数据乐观版本更新保留未知扩展，旧版本不覆盖', () => 用库(({ 库 }) => {
  assert.equal(库.更新对话('chat-a', { 预期版本: 1, 扩展: { 保留: '是' }, 写长期记忆: true }).元数据版本, 2)
  assert.equal(库.更新对话('chat-a', { 预期版本: 2, 模型: 'fixture-pro', 标题: '一起听歌' }).元数据版本, 3)
  assert.equal(库.更新对话('chat-a', { 预期版本: 2, 写长期记忆: false }).代码, 'SQLITE_CHAT_VERSION_CONFLICT')
  成功(库); const 段 = 库.读取对话('chat-a'); assert.equal(段.元数据版本, 3); assert.equal(段.写长期记忆, true); assert.deepEqual(段.扩展, { 保留: '是' }); assert.equal(段.建于, 时间)
}))
测('读出对象及回执副本的修改不能影响库', () => 用库(({ 库 }) => {
  const 回 = 成功(库); 回.消息编号[0] = 'mutated'; const 页 = 库.读消息页({ 对话: 'chat-a' }); 页.消息[0].内容 = '修改'; 库.读取对话('chat-a').扩展.伪字段 = true
  assert.equal(库.读最近聊天(2, { 对话: 'chat-a' })[0].内容, 轮().用户正文); assert.deepEqual(库.读取对话('chat-a').扩展, {}); assert.notEqual(成功(库).消息编号[0], 'mutated')
}))
测('一轮同时提交双消息/回执/计数，消息稳定编号正确', () => 用库(({ 库 }) => {
  const 回 = 成功(库), 消息 = 库.读最近聊天(2, { 对话: 'chat-a' })
  assert.equal(回.状态, 'saved'); assert.deepEqual(消息.map((一) => 一.编号), 回.消息编号); assert.deepEqual(消息.map((一) => 一.序号), [1, 2]); assert.deepEqual(消息.map((一) => 一.角色), ['user', 'assistant'])
  assert.deepEqual(库.取统计(), { 会话数: 1, 消息数: 2, 轮次数: 1 }); assert.equal(库.读取对话('chat-a').最后, 轮().完成于); assert.equal(库.核验().好, true)
}))
测('未提供发生时间只保留null，用接收时间显示', () => 用库(({ 库 }) => {
  const 一 = 轮(); delete 一.发生于; 成功(库, 一); const [用户, 回复] = 库.读最近聊天(2, { 对话: 'chat-a' })
  assert.equal(用户.发生于, null); assert.equal(用户.时间, 时间); assert.equal(用户.接收于, 时间); assert.equal(Object.hasOwn(回复, '发生于'), false)
}))
测('分别保留发生/接收/完成时间；新写入严格UTC', () => 用库(({ 库 }) => {
  const 发生于 = '2026-10-24T23:00:00.000Z'; 成功(库, 轮('t-01', 'chat-a', { 发生于 })); const [用户] = 库.读最近聊天(2, { 对话: 'chat-a' }); assert.equal(用户.时间, 发生于); assert.equal(用户.接收于, 时间)
  for (const 值 of ['2026-10-25 08:00:00', '2026-10-25T08:00:00+08:00', 'not-a-date', null]) assert.equal(库.存对话一轮(轮('bad', 'chat-a', { 接收于: 值 })).好, false)
  assert.equal(库.取统计().消息数, 2)
}))
测('不同会话同轮次编号互不干扰，不串模型或历史', () => 用库(({ 库 }) => {
  库.登记对话('chat-b', { 建于: 时间, 模型: 'model-b' }); const a = 成功(库), b = 成功(库, 轮('t-01', 'chat-b', { 用户正文: '另一段对话' }))
  assert.notEqual(a.消息编号[0], b.消息编号[0]); assert.ok(库.读最近聊天(20, { 对话: 'chat-a' }).every((一) => 一.对话 === 'chat-a')); assert.equal(库.读最近聊天(20, { 对话: 'chat-b' })[0].内容, '另一段对话'); assert.equal(库.读取对话('chat-a').模型, '')
}))
测('提交后遗失调用回执，原请求重提返回同编号且不追加', () => 用库(({ 库 }) => {
  const 首 = 成功(库); const 重 = 成功(库, { ...轮(), 发生于: undefined }); assert.deepEqual(重, 首); assert.equal(库.取统计().消息数, 2); assert.equal(库.读取对话('chat-a').条数, 2)
}))
测('同键不同内容或来源时间拒绝，不伪装幂等成功', () => 用库(({ 库 }) => {
  成功(库)
  for (const 改 of [{ 回复正文: '另一个回复' }, { 用户正文: '另一个输入' }, { 接收于: '2026-10-25T00:02:00.000Z' }, { 完成于: '2026-10-25T00:02:00.000Z' }]) assert.equal(库.存对话一轮(轮('t-01', 'chat-a', 改)).代码, 'SQLITE_CHAT_TURN_CONFLICT')
  assert.equal(库.取统计().消息数, 2)
}))
测('写入序号决定历史顺序，不按延迟来源时间重排', () => 用库(({ 库 }) => {
  成功(库); 成功(库, 轮('t-02', 'chat-a', { 发生于: '2026-10-20T00:00:00.000Z', 完成于: '2026-10-24T23:59:00.000Z' }))
  assert.deepEqual(库.读最近聊天(4, { 对话: 'chat-a' }).map((一) => 一.轮次), ['t-01', 't-01', 't-02', 't-02'])
}))
测('键集分页完整无重复，每页按旧到新返回', () => 用库(({ 库 }) => {
  for (let i = 0; i < 9; i++) 成功(库, 轮(`turn-${i}`))
  let 游标 = null, 全部 = [], 次数 = 0
  do { const 页 = 库.读消息页({ 对话: 'chat-a', 大小: 3, 游标 }); assert.equal(页.消息.length, 3); assert.ok(页.消息[0].序号 < 页.消息[2].序号); 全部 = [...页.消息, ...全部]; 游标 = 页.下一页; 次数++ } while (游标)
  assert.equal(次数, 6); assert.deepEqual(全部.map((一) => 一.序号), Array.from({ length: 18 }, (_, i) => i + 1)); assert.equal(new Set(全部.map((一) => 一.编号)).size, 18)
}))
测('翻页期间有新轮次，旧窗口上界固定，新首页可见新增', () => 用库(({ 库 }) => {
  for (let i = 0; i < 3; i++) 成功(库, 轮(`old-${i}`))
  const 首 = 库.读消息页({ 对话: 'chat-a', 大小: 2 }); 成功(库, 轮('new'))
  const 次 = 库.读消息页({ 对话: 'chat-a', 大小: 2, 游标: 首.下一页 }); assert.equal(次.上界, 6); assert.deepEqual(次.消息.map((一) => 一.序号), [3, 4]); assert.deepEqual(库.读消息页({ 对话: 'chat-a', 大小: 2 }).消息.map((一) => 一.序号), [7, 8])
}))
测('游标绑定会话和数据库；同连接其他句柄可续页', () => 用库(async ({ ctx, 库 }) => {
  成功(库); 库.登记对话('chat-b', { 建于: 时间 }); const 页 = 库.读消息页({ 对话: 'chat-a', 大小: 1 })
  assert.throws(() => 库.读消息页({ 对话: 'chat-b', 游标: 页.下一页 }), { message: 'SQLITE_CHAT_CURSOR_INVALID' })
  assert.equal(创建会话仓储(ctx).读消息页({ 对话: 'chat-a', 游标: 页.下一页 }).消息[0].序号, 1)
  await 用库(({ 库: 另 }) => assert.throws(() => 另.读消息页({ 对话: 'chat-a', 游标: 页.下一页 }), { message: 'SQLITE_CHAT_CURSOR_INVALID' }))
}))
测('篡改或畸形游标拒绝，不回到全库或第一页', () => 用库(({ 库 }) => {
  成功(库); const 游标 = 库.读消息页({ 对话: 'chat-a', 大小: 1 }).下一页
  for (const 值 of ['', 'abc', 1, {}, 游标.slice(0, -2) + 'aa', 'a'.repeat(1025)]) assert.throws(() => 库.读消息页({ 对话: 'chat-a', 游标: 值 }), { message: 'SQLITE_CHAT_CURSOR_INVALID' })
}))
测('已签名但版本或上界非法的游标也拒绝', () => 用库(({ ctx, 库 }) => {
  成功(库); const 原 = 库.读消息页({ 对话: 'chat-a', 大小: 1 }).下一页, 值 = JSON.parse(Buffer.from(原.split('.')[0], 'base64url').toString())
  for (const 改 of [{ 版本: 2 }, { 上界: 99 }, { 之前: 0 }]) {
    const 文 = Buffer.from(JSON.stringify({ ...值, ...改 })).toString('base64url'), 签 = createHmac('sha256', 取内部(ctx).游标密钥).update(文).digest('base64url')
    assert.throws(() => 库.读消息页({ 对话: 'chat-a', 游标: 文 + '.' + 签 }), { message: 'SQLITE_CHAT_CURSOR_INVALID' })
  }
}))
测('分页与历史上限严格校验，不支持无界全读', () => 用库(({ 库 }) => {
  for (const 大小 of [0, -1, 201, 1.5, '20', null]) assert.throws(() => 库.读消息页({ 对话: 'chat-a', 大小 }), 输入错)
  for (const 数 of [0, -1, 401, NaN]) assert.throws(() => 库.读最近聊天(数, { 对话: 'chat-a' }), 输入错)
  assert.throws(() => 库.列对话({ 上限: 201 }), 输入错)
}))
测('空会话与不存在的会话明确区分', () => 用库(({ 库 }) => {
  assert.deepEqual(库.读消息页({ 对话: 'chat-a' }).消息, []); assert.equal(库.读取对话('absent'), null)
  assert.throws(() => 库.读消息页({ 对话: 'absent' }), { message: 'SQLITE_CHAT_CONVERSATION_NOT_FOUND' }); assert.equal(库.存对话一轮(轮('t-01', 'absent')).好, false)
}))
测('回复行SQL失败：用户行/回执/计数整体回滚，随后重试可成功', () => 用库(({ db, 库 }) => {
  db.exec("CREATE TEMP TRIGGER reject_reply BEFORE INSERT ON chat_messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT,'PRIVATE-SQL-SENTINEL'); END")
  const 回 = 库.存对话一轮(轮()); assert.deepEqual(回, { 好: false, 状态: 'rolled-back', 代码: 'SQLITE_CONTEXT_TRANSACTION_FAILED' })
  assert.deepEqual(库.取统计(), { 会话数: 1, 消息数: 0, 轮次数: 0 }); assert.equal(库.读取对话('chat-a').条数, 0)
  db.exec('DROP TRIGGER reject_reply'); assert.equal(成功(库).起序, 1); assert.equal(库.核验().好, true)
}))
测('双消息后计数更新SQL失败仍全部回滚，无假saved', () => 用库(({ db, 库 }) => {
  db.exec("CREATE TEMP TRIGGER reject_count BEFORE UPDATE ON chat_sessions WHEN NEW.message_count>OLD.message_count BEGIN SELECT RAISE(ABORT,'PRIVATE-METADATA-SENTINEL'); END")
  assert.equal(库.存对话一轮(轮()).状态, 'rolled-back'); assert.equal(库.取统计().轮次数, 0); assert.equal(库.取统计().消息数, 0); assert.equal(库.读取对话('chat-a').最后, 时间)
  db.exec('DROP TRIGGER reject_count'); 成功(库)
}))
测('会话登记或设置保存失败不破坏旧会话', () => 用库(({ db, 库 }) => {
  db.exec("CREATE TEMP TRIGGER reject_session BEFORE INSERT ON chat_sessions BEGIN SELECT RAISE(ABORT,'no'); END")
  assert.equal(库.登记对话('chat-b', { 建于: 时间 }).状态, 'rolled-back'); assert.equal(库.取统计().会话数, 1); db.exec('DROP TRIGGER reject_session')
  db.exec("CREATE TEMP TRIGGER reject_setting BEFORE UPDATE ON chat_sessions BEGIN SELECT RAISE(ABORT,'no'); END")
  assert.equal(库.更新对话('chat-a', { 预期版本: 1, 模型: 'new' }).好, false); assert.equal(库.读取对话('chat-a').元数据版本, 1); assert.equal(库.读取对话('chat-a').模型, '')
}))
测('SQLite外键阻止消息被移到不存在的对话', () => 用库(({ db, 库 }) => {
  成功(库); assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1)
  assert.throws(() => db.prepare('UPDATE chat_messages SET conversation_id=?').run('not-registered')); assert.equal(库.核验().好, true)
}))
测('坏schema拒绝打开或读历史，不自动建空表修复', () => 用库(({ ctx, db, 库 }) => {
  db.exec('DROP TABLE chat_messages')
  assert.throws(() => 创建会话仓储(ctx), { message: 'SQLITE_CHAT_SCHEMA_INVALID' }); assert.throws(() => 库.读最近聊天(2, { 对话: 'chat-a' }), { message: 'SQLITE_CHAT_SCHEMA_INVALID' })
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='chat_messages'").get().n, 0)
}))
测('未知schema版本不自动降级', () => 用库(({ ctx, db }) => {
  db.prepare("UPDATE repository_meta SET value='99' WHERE key='chat_schema'").run(); assert.throws(() => 创建会话仓储(ctx), { message: 'SQLITE_CHAT_SCHEMA_INVALID' }); assert.equal(db.prepare("SELECT value FROM repository_meta WHERE key='chat_schema'").get().value, '99')
}))
测('JSON投影与正文不符时报错，不返回空历史', () => 用库(({ db, 库 }) => {
  成功(库); db.prepare("UPDATE chat_messages SET payload_json='{}' WHERE role='assistant'").run()
  assert.throws(() => 库.读最近聊天(2, { 对话: 'chat-a' }), { message: 'SQLITE_CHAT_INTEGRITY_FAILED' }); assert.throws(() => 库.核验(), { message: 'SQLITE_CHAT_INTEGRITY_FAILED' })
}))
测('缺失已提交消息时，幂等重提不得伪报saved', () => 用库(({ db, 库 }) => {
  成功(库); db.exec("DELETE FROM chat_messages WHERE role='assistant'")
  assert.equal(库.存对话一轮(轮()).代码, 'SQLITE_CHAT_INTEGRITY_FAILED'); assert.equal(库.取统计().消息数, 1)
}))
测('提交已成功但驱动报错：unknown且封闭能力，不盲目重做', () => 用库(({ ctx, db, 库 }) => {
  const 原 = db.exec; let 提交数 = 0
  db.exec = function (文) { const 果 = 原.call(this, 文); if (文 === 'COMMIT') { 提交数++; throw new Error('PRIVATE-COMMIT-SENTINEL') } return 果 }
  const 回 = 库.存对话一轮(轮()); assert.equal(回.状态, 'unknown'); assert.equal(回.代码, 'SQLITE_CONTEXT_COMMIT_UNKNOWN'); assert.equal(提交数, 1); assert.equal(ctx.取状态().可用, false)
  assert.equal(db.prepare('SELECT count(*) AS n FROM chat_messages').get().n, 2); assert.equal(库.存对话一轮(轮()).代码, 'SQLITE_CONTEXT_UNUSABLE'); assert.equal(提交数, 1)
  db.exec = 原
}))
测('回滚本身失败：unknown且禁止继续读写，不暴露半轮', () => 用库(({ ctx, db, 库 }) => {
  db.exec("CREATE TEMP TRIGGER reject_reply BEFORE INSERT ON chat_messages WHEN NEW.role='assistant' BEGIN SELECT RAISE(ABORT,'no'); END")
  const 原 = db.exec; db.exec = function (文) { if (文 === 'ROLLBACK') throw new Error('PRIVATE-ROLLBACK-SENTINEL'); return 原.call(this, 文) }
  const 回 = 库.存对话一轮(轮()); assert.equal(回.状态, 'unknown'); assert.equal(回.代码, 'SQLITE_CONTEXT_ROLLBACK_FAILED'); assert.equal(ctx.取状态().可用, false); assert.throws(() => 库.读最近聊天(2, { 对话: 'chat-a' }), { message: 'SQLITE_CONTEXT_UNUSABLE' })
  db.exec = 原
}))
测('异步调用交错落库不串线，单连接各会话序号连续', () => 用库(async ({ ctx, 库 }) => {
  const 另一 = 创建会话仓储(ctx); 库.登记对话('chat-b', { 建于: 时间 })
  await Promise.all(Array.from({ length: 40 }, async (_, i) => { await Promise.resolve(); const 目标 = i % 2 ? 'chat-a' : 'chat-b'; 成功(i % 3 ? 库 : 另一, 轮(`async-${i}`, 目标)) }))
  for (const 号 of ['chat-a', 'chat-b']) { const 行 = 库.读最近聊天(400, { 对话: 号 }); assert.equal(行.length, 40); assert.ok(行.every((一) => 一.对话 === 号)); assert.deepEqual(行.map((一) => 一.序号), Array.from({ length: 40 }, (_, i) => i + 1)) }
  assert.equal(库.核验().好, true)
}))
测('拒绝非法元数据/扩展且不执行getter/toJSON', () => 用库(({ 库 }) => {
  let 执行 = false; const getter = { 建于: 时间, get 模型() { 执行 = true; return 'bad' } }, toJSON = { toJSON() { 执行 = true; return {} } }
  for (const 改 of [getter, { 建于: 时间, 扩展: toJSON }, { 建于: 时间, 模型: null }, { 建于: 时间, 写长期记忆: 'true' }, { 建于: 时间, 模式: 'unknown' }, { 建于: 时间, 多余: true }, { 建于: 时间, 扩展: { x: undefined } }, { 建于: 时间, 扩展: { x: Infinity } }]) assert.equal(库.登记对话('bad', 改).好, false)
  assert.equal(执行, false); const 循环 = {}; 循环.x = 循环; assert.equal(库.登记对话('bad', { 建于: 时间, 扩展: 循环 }).好, false); assert.equal(库.取统计().会话数, 1)
  for (const 键 of ['0\n', '4294967295']) { const 稀疏 = new Array(1); 稀疏[键] = 'bad'; assert.equal(库.登记对话('bad', { 建于: 时间, 扩展: { 数组: 稀疏 } }).好, false) }
}))
测('正文/编号/额外键超限拒绝，无副作用', () => 用库(({ 库 }) => {
  for (const 改 of [{ 用户正文: 'a'.repeat(262145) }, { 轮次: 'x'.repeat(129) }, { 用户正文: '\uD800' }, { 回复正文: null }, { 附件路径: 'not-used' }]) assert.equal(库.存对话一轮(轮('bad', 'chat-a', 改)).好, false)
  assert.equal(库.取统计().消息数, 0)
}))
测('参数绑定保留SQL字面文本/emoji/NUL，统计与错误不含正文', () => 用库(({ 库 }) => {
  const 文 = "PRIVATE-BODY 🌸\u0000'); DROP TABLE chat_sessions; --"; 成功(库, 轮('t-01', 'chat-a', { 用户正文: 文 })); assert.equal(库.读最近聊天(2, { 对话: 'chat-a' })[0].内容, 文)
  const 错 = 库.存对话一轮(轮('t-01', 'chat-a', { 用户正文: 'different' })); assert.equal(JSON.stringify(错).includes('PRIVATE-BODY'), false); assert.equal(JSON.stringify(库.取统计()).includes('PRIVATE-BODY'), false); assert.equal(库.核验().好, true)
}))
测('禁止嵌套/异步事务回调，失败后连接可继续使用', () => 用库(({ ctx, 库 }) => {
  assert.throws(() => 原子执行(ctx, () => 原子执行(ctx, () => 1)), { message: 'SQLITE_CONTEXT_NESTED_FORBIDDEN' })
  assert.throws(() => 原子执行(ctx, () => Promise.resolve(1)), { message: 'SQLITE_CONTEXT_SYNC_REQUIRED' }); 成功(库); assert.equal(库.核验().好, true)
}))
测('关闭幂等，关闭后不接受写入或读取', () => 用库(({ ctx, 库 }) => {
  ctx.关闭(); ctx.关闭(); assert.equal(ctx.取状态().已关闭, true); assert.equal(库.存对话一轮(轮()).代码, 'SQLITE_CONTEXT_CLOSED'); assert.throws(() => 库.读最近聊天(2, { 对话: 'chat-a' }), { message: 'SQLITE_CONTEXT_CLOSED' })
}))
测('真实子进程阻断文件API/网络/业务依赖后仍能完成回环', () => {
  const 输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures', 'sqlite-chat-audit.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  assert.equal(输出.trim(), 'SQLITE_CHAT_AUDIT_OK')
})
;(async () => {
  let 通过 = 0
  for (const [名, 做] of 测试) { try { await 做(); 通过++; console.log(`PASS ${名}`) } catch (错) { console.error(`FAIL ${名} (${错.code === 'ERR_ASSERTION' ? 'assertion' : /^SQLITE_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'test-error'})`) } }
  console.log(`SQLite S-15B: ${通过}/${测试.length}; synthetic only; no production wiring`)
  if (通过 !== 测试.length) process.exitCode = 1
})()
