'use strict'
const assert = require('node:assert/strict'), { execFileSync } = require('node:child_process'), path = require('node:path')
const { 创建内存上下文, 取内部 } = require('../storage/sqlite-context.cjs')
const { 创建会话仓储 } = require('../storage/sqlite-chat.cjs'), { 创建记忆仓储 } = require('../storage/sqlite-memory.cjs')
const 时间 = '2026-10-25T00:00:00.000Z', 测试 = [], 测 = (名, 做) => 测试.push([名, 做])
async function 用库(做) {
  const ctx = 创建内存上下文({ 用途: 'synthetic-sqlite-repository' })
  try {
    const chat = 创建会话仓储(ctx), mem = 创建记忆仓储(ctx), db = 取内部(ctx).db
    assert.equal(chat.登记对话('chat-a', { 建于: 时间, 写长期记忆: true }).好, true)
    let 序 = 0, 操 = 0
    const 发 = (正文 = '我喜欢雨后的散步', 时 = 时间, 号 = 'chat-a') => { const 回 = chat.存对话一轮({ 对话: 号, 轮次: 'turn-' + (++序), 用户正文: 正文, 回复正文: '我记住啦。', 接收于: 时, 完成于: 时 }); assert.equal(回.好, true); return 回.消息编号 }
    const 源 = 发(), 调 = (方法, 参数 = {}) => mem[方法]({ 操作编号: 'op-' + (++操), 时间, 预期版本: mem.取统计().版本, ...参数 })
    const 新 = (参数 = {}) => { const 回 = 调('新增临时', { 类别: '候选偏好', 内容: '用户喜欢雨后的散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步', ...参数 }); assert.equal(回.好, true); return 回.临时编号 }
    const 评 = (号, 消息编号 = [源[0]], 参数 = {}) => 调('评估并晋升', { 编号: 号, 消息编号, ...参数 })
    await 做({ ctx, chat, mem, db, 源, 发, 调, 新, 评 })
  } finally { ctx.关闭() }
}
测('共享B能力，多个记忆句柄不建第二份库', () => 用库(({ ctx, mem, 新 }) => { const 号 = 新(); assert.equal(创建记忆仓储(ctx).读取临时(号).条.编号, 号); assert.equal(mem.取统计().临时数, 1) }))
测('手动新增保留原默认确认/30天保留规则', () => 用库(({ mem, 新 }) => { const 号 = 新({ 细节: { 手动: true, 保留天数: 30 }, 扩展: { 空值: null, 空串: '' } }), 条 = mem.读取临时(号).条; assert.equal(条.确认状态, '已确认'); assert.deepEqual(条.扩展, { 空值: null, 空串: '' }); assert.equal(条.到期于, '2026-11-24T00:00:00.000Z') }))
测('自动新增需真实逐字来源，正文沿用你我视角', () => 用库(({ mem, 新, 源 }) => { const 号 = 新(), 条 = mem.读取临时(号).条; assert.equal(条.内容, '你喜欢雨后的散步'); assert.equal(条.确认状态, '待确认'); assert.equal(条.来源.消息编号, 源[0]); assert.equal(条.到期于, '2026-11-01T00:00:00.000Z') }))
测('助手消息/不存在来源/非逐字依据不能制造候选', () => 用库(({ mem, 调, 源 }) => {
  for (const 改 of [{ 来源消息编号: 源[1] }, { 来源消息编号: 'absent' }, { 依据原文: '并未说过的话' }]) assert.equal(调('新增临时', { 类别: '候选偏好', 内容: '你喜欢散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步', ...改 }).好, false)
  assert.equal(mem.取统计().临时数, 0); assert.equal(mem.取统计().版本, 0)
}))
测('拒绝外部直接指定高分/确认/生命周期', () => 用库(({ 调, 源, mem }) => {
  for (const 改 of [{ 分数: 100 }, { 确认状态: '已确认' }, { 生命周期: '有效' }]) assert.equal(调('新增临时', { 类别: '候选偏好', 内容: '你喜欢散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步', ...改 }).好, false)
  assert.equal(mem.取统计().操作数, 0)
}))
测('来源会话长期记忆开关在事务中复核', () => 用库(({ chat, mem, 新, 评, 调, 源 }) => {
  const 号 = 新(); chat.更新对话('chat-a', { 预期版本: 1, 写长期记忆: false }); assert.equal(评(号).代码, 'SQLITE_MEMORY_SWITCH_OFF')
  assert.equal(调('新增临时', { 类别: '候选偏好', 内容: '你喜欢散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步' }).好, false); assert.equal(mem.取统计().证据数, 0)
}))
测('单次偏好60分：证据/确认/晋升/目标评分同时保存', () => 用库(({ mem, 新, 评 }) => {
  const 号 = 新(), 回 = 评(号), 条 = mem.读取临时(号).条, 长 = mem.列长期().列表[0]
  assert.equal(回.分数, 60); assert.equal(回.晋升, true); assert.equal(条.生命周期, '已晋升'); assert.equal(条.晋升.目标编号, 长.编号); assert.equal(长.临时记忆, 号); assert.equal(长.自主评估.分数, 60); assert.equal(长.对话, 'chat-a'); assert.equal(mem.取统计().证据数, 1); assert.equal(mem.核验().好, true)
}))
测('可复用做法与事件沿用原有目标分类', () => 用库(({ 新, 评, 发, mem }) => {
  const 做法 = 发('请记住，我写代码前先列出测试清单')[0], 号 = 新({ 类别: '未完话题', 内容: '你写代码前先列出测试清单', 来源消息编号: 做法, 依据原文: '写代码前先列出测试清单', 细节: { 记忆类型: 'procedural' } })
  assert.equal(评(号, [做法]).晋升, true); assert.equal(mem.列长期().列表[0].类别, '小本子')
  const 事件 = 发('请记住，我们一起听了小提琴')[0], 二 = 新({ 类别: '近期事件', 内容: '我们一起听了小提琴', 来源消息编号: 事件, 依据原文: '请记住，我们一起听了小提琴', 细节: { 记忆类型: 'episodic' } })
  assert.equal(评(二, [事件]).晋升, true); assert.equal(mem.列长期({ 类别: '经历' }).列表.length, 1)
}))
测('低分也记逐字证据，仍待确认不升格', () => 用库(({ 新, 发, 评, mem }) => {
  const 源 = 发('我最近在使用蓝色主题')[0], 号 = 新({ 类别: '近期状态', 内容: '你最近在使用蓝色主题', 来源消息编号: 源, 依据原文: '最近在使用蓝色主题', 细节: { 记忆类型: 'episodic' } }), 回 = 评(号, [源])
  assert.equal(回.晋升, false); assert.ok(回.分数 < 60); const 条 = mem.读取临时(号).条; assert.equal(条.确认状态, '待确认'); assert.equal(条.评估账本.证据[0].依据原文, '最近在使用蓝色主题'); assert.equal(mem.取统计().长期数, 0)
}))
测('操作幂等跨句柄成立，返回副本不污染原回执', () => 用库(({ ctx, mem, 源 }) => {
  const 一 = { 操作编号: 'same', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨后的散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步' }, 回 = mem.新增临时(一), 号 = 回.临时编号
  回.临时编号 = 'mutated'; assert.equal(创建记忆仓储(ctx).新增临时({ ...一 }).临时编号, 号); assert.equal(mem.取统计().临时数, 1); assert.equal(mem.取统计().操作数, 1)
}))
测('同一来源重复消费不虚增提及与评估历史', () => 用库(({ 新, 发, 评, mem }) => {
  const 源 = 发('我最近在使用蓝色主题')[0], 号 = 新({ 类别: '近期状态', 内容: '你最近在使用蓝色主题', 来源消息编号: 源, 依据原文: '最近在使用蓝色主题' }); 评(号, [源]); 评(号, [源, 源])
  assert.equal(mem.取统计().证据数, 1); assert.equal(mem.取统计().历史数, 1); assert.equal(mem.读取临时(号).条.评估账本.提及次数, 1)
}))
测('新消息再次提及复用原临时编号并提升', () => 用库(({ 新, 发, 评, mem }) => {
  const 源 = 发('我最近在使用蓝色主题')[0], 号 = 新({ 类别: '近期状态', 内容: '你最近在使用蓝色主题', 来源消息编号: 源, 依据原文: '最近在使用蓝色主题' }); 评(号, [源]); const 再 = 发('我最近在使用蓝色主题', '2026-10-25T01:00:00.000Z')[0]
  assert.equal(评(号, [再]).晋升, true); assert.equal(mem.取统计().临时数, 1); assert.equal(mem.取统计().证据数, 2); assert.equal(mem.列长期().列表[0].临时记忆, 号)
}))
测('归档无新依据不复活；新依据复活并保存历史', () => 用库(({ 新, 发, 评, 调, mem }) => {
  const 源 = 发('我最近在使用蓝色主题')[0], 号 = 新({ 类别: '近期状态', 内容: '你最近在使用蓝色主题', 来源消息编号: 源, 依据原文: '最近在使用蓝色主题' }); 评(号, [源]); 调('人工处理临时', { 动作: '归档到期', 参数: [], 时间: '2026-10-28T00:00:00.000Z' })
  assert.equal(评(号, [源], { 时间: '2026-10-28T00:00:00.000Z' }).代码, 'SQLITE_MEMORY_NO_NEW_EVIDENCE'); assert.equal(mem.读取临时(号).条.生命周期, '已归档')
  const 再 = 发('我最近在使用蓝色主题', '2026-10-28T00:00:00.000Z')[0], 回 = 评(号, [再], { 时间: '2026-10-28T00:00:00.000Z' }); assert.equal(回.复活, true); assert.equal(回.晋升, true); assert.equal(mem.读取临时(号).条.评估账本.证据.length, 2)
  const 未评分源 = 发('我最近在使用绿色主题')[0], 未评分 = 新({ 类别: '近期状态', 内容: '你最近在使用绿色主题', 来源消息编号: 未评分源, 依据原文: '最近在使用绿色主题' })
  调('人工处理临时', { 动作: '归档到期', 参数: [], 时间: '2026-10-28T00:00:00.000Z' })
  assert.equal(评(未评分, [未评分源], { 时间: '2026-10-28T00:00:00.000Z' }).代码, 'SQLITE_MEMORY_NO_NEW_EVIDENCE')
  const 真新源 = 发('我最近在使用绿色主题', '2026-10-28T00:00:00.000Z')[0]; assert.equal(评(未评分, [真新源], { 时间: '2026-10-28T00:00:00.000Z' }).晋升, true); assert.equal(mem.读取临时(未评分).条.评估账本.历史提及基数, 1)
}))
测('未归档但已到期的候选不能直接晋升', () => 用库(({ 新, 评, mem }) => { const 号 = 新(); assert.equal(评(号, undefined, { 时间: '2026-11-03T00:00:00.000Z' }).代码, 'SQLITE_MEMORY_EXPIRED'); assert.equal(mem.取统计().长期数, 0) }))
测('自动保留期不能拉长，人工仍可指定原允许范围', () => 用库(({ 调, 源 }) => { assert.equal(调('新增临时', { 类别: '候选偏好', 内容: '你喜欢散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步', 细节: { 保留天数: 30 } }).好, false) }))
测('替代冲突不能自动确认，人工决定后才切换双方', () => 用库(({ 新, 评, 调, mem }) => {
  const 旧 = 新({ 细节: { 手动: true } }), 新号 = 新(); assert.equal(调('人工处理临时', { 动作: '提议替代', 参数: [新号, 旧] }).好, true)
  assert.equal(评(新号).代码, 'SQLITE_MEMORY_AUTOMATION_BLOCKED'); assert.equal(mem.读取临时(旧).条.关系.状态, '当前')
  assert.equal(调('人工处理临时', { 动作: '决定替代', 参数: [新号, '替代旧条'] }).好, true); assert.equal(mem.读取临时(旧).条.关系.状态, '已被替代'); assert.equal(mem.读取临时(新号).条.确认状态, '已确认')
}))
测('人工确认晋升保持原批准流程，重提不重复写长期', () => 用库(({ 新, 调, mem }) => {
  const 号 = 新(), 回 = 调('人工确认晋升', { 编号: 号, 去向: '事实' }); assert.equal(回.晋升, true); assert.equal(调('人工确认晋升', { 编号: 号, 去向: '事实' }).目标编号, 回.目标编号); assert.equal(mem.取统计().长期数, 1)
}))
测('旧全库版本被拒绝，不覆盖新变化', () => 用库(({ 新, mem }) => { 新(); const 回 = mem.人工处理临时({ 操作编号: 'stale', 时间, 预期版本: 0, 动作: '归档到期', 参数: [] }); assert.equal(回.代码, 'SQLITE_MEMORY_VERSION_CONFLICT'); assert.equal(mem.取统计().操作数, 1) }))
测('操作编号内容冲突拒绝，原对象读取副本不可改库', () => 用库(({ 新, mem, 源 }) => {
  const 号 = 新(); const 条 = mem.读取临时(号).条; 条.内容 = '污染'; assert.notEqual(mem.读取临时(号).条.内容, '污染')
  assert.equal(mem.新增临时({ 操作编号: 'op-1', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '另一个内容', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步' }).代码, 'SQLITE_MEMORY_OPERATION_CONFLICT')
}))
for (const [标签, 触发器] of [
  ['长期插入', "BEFORE INSERT ON memory_long"],
  ['完成晋升标记', "BEFORE UPDATE ON memory_temporary WHEN NEW.lifecycle='已晋升'"],
  ['证据插入', 'BEFORE INSERT ON memory_evidence'],
  ['评估历史', 'BEFORE INSERT ON memory_assessments'],
  ['操作回执', "BEFORE INSERT ON memory_operations WHEN NEW.kind='evaluate-promote'"],
]) 测(`${标签}SQL失败，整批记账/确认/晋升回滚`, () => 用库(({ db, mem, 新, 评 }) => {
  const 号 = 新(), 原 = mem.读取临时(号).条, 统计 = mem.取统计(); db.exec(`CREATE TEMP TRIGGER reject_memory ${触发器} BEGIN SELECT RAISE(ABORT,'PRIVATE-SQL-SENTINEL'); END`)
  const 回 = 评(号); assert.equal(回.状态, 'rolled-back'); assert.equal(JSON.stringify(回).includes('PRIVATE'), false); assert.deepEqual(mem.取统计(), 统计); assert.deepEqual(mem.读取临时(号).条, 原)
  db.exec('DROP TRIGGER reject_memory'); assert.equal(评(号).晋升, true); assert.equal(mem.核验().好, true)
}))
测('人工晋升失败也回滚确认状态，不留半确认', () => 用库(({ db, 新, 调, mem }) => { const 号 = 新(); db.exec("CREATE TEMP TRIGGER reject_long BEFORE INSERT ON memory_long BEGIN SELECT RAISE(ABORT,'no'); END"); assert.equal(调('人工确认晋升', { 编号: 号, 去向: '事实' }).好, false); assert.equal(mem.读取临时(号).条.确认状态, '待确认') }))
测('删除临时保留内部墓碑，级联清理投影且不误删长期', () => 用库(({ 新, 评, 调, mem, db }) => {
  const 号 = 新(); 评(号); assert.equal(调('人工处理临时', { 动作: '删除', 参数: [号] }).好, true); assert.equal(mem.读取临时(号).条, null); assert.equal(mem.取统计().删除标记数, 1); assert.equal(mem.取统计().证据数, 0); assert.equal(mem.取统计().长期数, 1); assert.equal(JSON.parse(db.prepare('SELECT record_json FROM memory_tombstones').get().record_json).编号, 号); assert.equal(mem.核验().好, true)
}))
测('投影或回执被破坏时核验报错，不覆盖空库', () => 用库(({ 新, mem, db }) => {
  const 号 = 新(); db.prepare("UPDATE memory_temporary SET confirmation='已确认' WHERE memory_id=?").run(号); assert.throws(() => mem.核验(), { message: 'SQLITE_MEMORY_INTEGRITY_FAILED' })
}))
测('证据身份索引被损坏可检出', () => 用库(({ 新, 评, mem, db }) => { const 号 = 新(); 评(号); db.prepare("UPDATE memory_evidence SET fingerprint='bad'").run(); assert.throws(() => mem.核验(), { message: 'SQLITE_MEMORY_INTEGRITY_FAILED' }) }))
测('回执哈希不符时不能把篡改结果当重放成功', () => 用库(({ mem, db, 源 }) => {
  const 一 = { 操作编号: 'receipt', 时间, 预期版本: 0, 类别: '候选偏好', 内容: '你喜欢雨后的散步', 来源消息编号: 源[0], 依据原文: '喜欢雨后的散步' }; assert.equal(mem.新增临时(一).好, true)
  db.prepare("UPDATE memory_operations SET receipt_json='{}'").run(); assert.equal(mem.新增临时(一).代码, 'SQLITE_MEMORY_INTEGRITY_FAILED'); assert.throws(() => mem.核验(), { message: 'SQLITE_MEMORY_INTEGRITY_FAILED' })
}))
测('坏schema和未知版本不自动重建', () => 用库(({ ctx, db }) => {
  db.prepare("UPDATE repository_meta SET value='99' WHERE key='memory_schema'").run(); assert.throws(() => 创建记忆仓储(ctx), { message: 'SQLITE_MEMORY_SCHEMA_INVALID' }); db.prepare("UPDATE repository_meta SET value='1' WHERE key='memory_schema'").run()
  db.exec('DROP TABLE memory_evidence'); assert.throws(() => 创建记忆仓储(ctx), { message: 'SQLITE_MEMORY_SCHEMA_INVALID' }); assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name='memory_evidence'").get(), undefined)
}))
测('提交后驱动异常报unknown，共享能力停止读写', () => 用库(({ 新, 评, ctx, db, mem, chat }) => {
  const 号 = 新(), 原 = db.exec; db.exec = function (文) { const 果 = 原.call(this, 文); if (文 === 'COMMIT') throw new Error('PRIVATE-COMMIT'); return 果 }
  assert.equal(评(号).代码, 'SQLITE_CONTEXT_COMMIT_UNKNOWN'); assert.equal(ctx.取状态().可用, false); assert.throws(() => mem.取统计(), { message: 'SQLITE_CONTEXT_UNUSABLE' }); assert.throws(() => chat.取统计(), { message: 'SQLITE_CONTEXT_UNUSABLE' }); db.exec = 原
}))
测('未知扩展/getter/非JSON/不安全数字边界不触发业务写入', () => 用库(({ 调, mem }) => {
  let 执行 = false; const 原 = { 操作编号: 'bad', 时间, 预期版本: 0, get 类别() { 执行 = true; return '事实' } }; assert.equal(mem.新增长期(原).好, false); assert.equal(执行, false)
  for (const 值 of [undefined, NaN, 9007199254740992]) assert.equal(调('新增长期', { 类别: '事实', 内容: '你喜欢散步', 上下文: { 元数据: { person: 值 } } }).好, false)
  assert.equal(mem.取统计().长期数, 0)
}))
测('三类长期写入复用叙述/结构，列表有明确截断', () => 用库(({ 调, mem }) => {
  for (const 类别 of ['事实', '经历', '小本子']) assert.equal(调('新增长期', { 类别, 内容: '用户和爱莉一起听歌', 上下文: { 对话: 'chat-a' } }).好, true)
  assert.ok(mem.列长期().列表.every((x) => x.内容 === '你和我一起听歌')); assert.equal(mem.列长期({ 上限: 1 }).还有, true); assert.equal(mem.核验().好, true)
}))
测('长期编辑保留最初时间/来源/评分，只增加修改信息', () => 用库(({ 新, 评, 调, mem }) => {
  const 号 = 新(), 回 = 评(号), 旧 = mem.列长期().列表[0]
  assert.equal(调('人工修改长期', { 类别: '事实', 编号: 回.目标编号, 内容: '用户现在更喜欢夜里的散步', 修改对话: 'chat-a', 时间: '2026-10-25T01:00:00.000Z' }).好, true)
  const 改 = mem.列长期().列表[0]; assert.equal(改.时间, 旧.时间); assert.equal(改.临时记忆, 号); assert.equal(改.自主评估.分数, 60); assert.equal(改.内容, '你现在更喜欢夜里的散步'); assert.equal(改.修改于, '2026-10-25T01:00:00.000Z'); assert.equal(mem.核验().好, true)
}))
测('人工遗忘后不得由旧晋升请求重新造出长期条目', () => 用库(({ 新, 评, 调, mem }) => {
  const 号 = 新(), 回 = 评(号); assert.equal(调('人工遗忘长期', { 类别: '事实', 编号: 回.目标编号 }).好, true)
  assert.equal(mem.列长期().列表.length, 0); assert.equal(评(号).代码, 'SQLITE_MEMORY_TARGET_FORGOTTEN'); assert.equal(mem.取统计().长期删除标记数, 1); assert.equal(mem.核验().好, true)
}))
测('长期删除墓碑写入失败保留原记录', () => 用库(({ 新, 评, 调, mem, db }) => {
  const 回 = 评(新()); db.exec("CREATE TEMP TRIGGER fail_delete BEFORE INSERT ON memory_long_deleted BEGIN SELECT RAISE(ABORT,'no'); END")
  assert.equal(调('人工遗忘长期', { 类别: '事实', 编号: 回.目标编号 }).状态, 'rolled-back'); assert.equal(mem.取统计().长期数, 1); assert.equal(mem.取统计().长期删除标记数, 0)
}))
测('长期操作必须类别和编号一起匹配，不能误删其他类别', () => 用库(({ 新, 评, 调, mem }) => {
  const 回 = 评(新()); assert.equal(调('人工遗忘长期', { 类别: '经历', 编号: 回.目标编号 }).代码, 'SQLITE_MEMORY_NOT_FOUND'); assert.equal(mem.取统计().长期数, 1)
}))
测('敏感/工具内容不能自动进入候选或被自主确认', () => 用库(({ 发, 调, mem }) => {
  const 源 = 发('请记住，密码：仅供测试的占位内容')[0]; assert.equal(调('新增临时', { 类别: '候选偏好', 内容: '密码：仅供测试的占位内容', 来源消息编号: 源, 依据原文: '密码：仅供测试的占位内容' }).好, false); assert.equal(mem.取统计().临时数, 0)
}))
测('原生外键阻止无归属证据，关闭后拒绝操作', () => 用库(({ db, ctx, mem }) => { assert.throws(() => db.prepare('INSERT INTO memory_evidence VALUES(?,?,?,?)').run('absent', 'x', 0, '{}')); ctx.关闭(); assert.throws(() => mem.取统计(), { message: 'SQLITE_CONTEXT_CLOSED' }) }))
测('独立Node进程阻断文件/配置/网络后仍能60分晋升', () => { const 输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-memory-audit.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 10000 }); assert.equal(输出.trim(), 'SQLITE_MEMORY_AUDIT_OK') })
;(async () => { let 过 = 0; for (const [名, 做] of 测试) { try { await 做(); 过++; console.log(`PASS ${名}`) } catch (错) { console.error(`FAIL ${名} (${错.code === 'ERR_ASSERTION' ? 'assertion' : /^SQLITE_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'test-error'})`) } } console.log(`SQLite S-15C: ${过}/${测试.length}; synthetic only; no production wiring`); if (过 !== 测试.length) process.exitCode = 1 })()
