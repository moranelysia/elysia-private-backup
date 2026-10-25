'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-sqlite-D-'))
process.env.ELYSIA_DATA_DIR = path.join(根, 'data'); process.env.ELYSIA_CACHE_DIR = path.join(根, 'cache')
const { 创建内存上下文, 取内部 } = require('../storage/sqlite-context.cjs')
const { 创建状态仓储 } = require('../storage/sqlite-state.cjs'), { 创建日记仓储 } = require('../storage/sqlite-diary.cjs')
const { 创建关系图库 } = require('../脑/记忆关系图.cjs')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../脑/渠道权限.cjs'), { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const { 创建渠道会话映射 } = require('../脑/渠道会话映射.cjs'), { 创建渠道任务调度 } = require('../脑/渠道任务调度.cjs')
const 样例 = require('./fixtures/渠道契约-v1.json')
const 时间 = '2026-10-26T00:00:00.000Z', 本机 = { 用途: 'local-private-diary' }, 测试 = [], 测 = (名, 做) => 测试.push([名, 做]), 拷 = (一) => JSON.parse(JSON.stringify(一))
const 图数据 = () => ({ 格式版本: 2, 更新于: 时间, 关系: [{ 编号: 'r-01', 类型: '先于', 从: { 类别: '事实', 编号: 'a' }, 到: { 类别: '经历', 编号: 'b' }, 来源: '人工确认', 创建于: 时间, 修改于: 时间 }], 自动抑制: [], 扩展: { 空值: null, 空串: '' } })
function 篇(私密 = false, 周期 = '2026-10-25') { return { 格式版本: 1, 编号: 私密 ? '私密日:' + 周期 : '日:' + 周期, 类型: '日', 周期, 开始: 周期 + 'T00:00:00.000Z', 结束: '2026-10-26T00:00:00.000Z', 标题: 私密 ? '留在这里' : '今天', 可见性: 私密 ? 'private' : 'shared', 模块: [{ 名字: '陪伴片段', 正文: 私密 ? '你说最近很难。我想再靠近一点，却只陪你坐了一会儿。' : '我们一起听了曲子，我很开心。', 来源: ['source-a'] }], 来源: [{ 编号: 'source-a', 类型: '对话', 时间, 标题: '一起听歌', 摘要: '你说起最近的心事。' }], 生成于: 时间, 修改于: '', 用户修改: false, 扩展: { 未来字段: true } } }
async function 用库(做) { const ctx = 创建内存上下文({ 用途: 'synthetic-sqlite-repository' }); try { const state = 创建状态仓储(ctx), diary = 创建日记仓储(ctx); await 做({ ctx, state, diary, db: 取内部(ctx).db }) } finally { ctx.关闭() } }
function 图(state) { const 关系 = state.创建后端('relations'), 布局 = state.创建后端('relation-layout'); let n = 0; const 数据 = [{ 编号: 'a', 类别: '事实', 内容: '你喜欢散步', 时间 }, { 编号: 'b', 类别: '经历', 内容: '我们一起散步', 时间 }]; return 创建关系图库({ 存储: { 关系, 布局 }, 长期记忆库: { 全部长期记忆: () => 数据 }, 现在: () => new Date(时间), 造编号: () => 'manual-' + (++n) }) }
const 来信 = (改 = {}) => ({ ...拷(样例.本人私聊), 端点: { 渠道: 'fake', 账号: 'local-fixture' }, 发生于: 时间, 接收于: 时间, ...改 })
function 渠道(state, { 名 = 'tasks', 处理, 钟 = { 毫秒: Date.parse(时间) } } = {}) {
  const 取现在 = () => new Date(钟.毫秒), 消息 = 来信(), 权限 = 创建渠道权限({ 绑定: [{ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false }], 取现在 })
  const 适配器 = 创建假渠道适配器({ 取现在 }), 守卫 = 创建渠道权限守卫({ 适配器, 权限, 取现在 }), 映射 = 创建渠道会话映射({ 权限, 存储: state.创建后端('channel-map', 'map-' + 名) })
  let 核心数 = 0, 调度; const 后端 = state.创建后端('channel-tasks', 名)
  try { 调度 = 创建渠道任务调度({ 守卫, 权限, 映射, 取现在, 存储: 后端, 处理: async (...args) => { 核心数++; return 处理 ? 处理(...args) : { 可见性: 'shared', 正文: '我在这里。', 附件: [] } } }); 调度.启动() }
  catch (错) { 映射.关闭(); 守卫.关闭(); 权限.关闭(); 适配器.关闭(); throw 错 }
  return { 适配器, 调度, 权限, 守卫, 映射, 钟, 后端, 核心数: () => 核心数, 关闭() { try { 调度.关闭() } finally { 映射.关闭(); 守卫.关闭(); 权限.关闭(); 适配器.关闭() } } }
}
async function 等待(条件) { for (let i = 0; i < 200; i++) { if (条件()) return; await new Promise((好) => setImmediate(好)) }; assert.fail('ISOLATED_WAIT_TIMEOUT') }
测('显式后端与首次读取要求；拒绝路径/凭据/私密命名空间', () => 用库(({ state }) => {
  for (const 类型 of ['private', 'diary-private', 'settings', 'secrets']) assert.throws(() => state.创建后端(类型))
  assert.throws(() => state.创建后端('relations', '../file')); const 一 = state.创建后端('relations'); assert.throws(() => 一.保存(图数据()), { message: 'SQLITE_STATE_READ_REQUIRED' }); 一.读取(); assert.equal(一.保存(图数据()).好, true)
}))
测('状态与未知字段完整保留，返回副本不改库', () => 用库(({ state }) => { const 一 = state.创建后端('relations'); 一.读取(); 一.保存(图数据()); const 值 = 一.读取(); 值.关系[0].类型 = '更新'; assert.equal(一.读取().关系[0].类型, '先于'); assert.deepEqual(一.读取().扩展, { 空值: null, 空串: '' }); assert.equal(state.核验().好, true) }))
测('图谱编辑保留SQLite未知根字段和边扩展', () => 用库(({ state }) => { const a = state.创建后端('relations'), 值 = 图数据(); 值.关系[0].扩展 = { 原样: true }; a.读取(); a.保存(值); const 库 = 图(state); 库.修改({ 编号: 'r-01', 类型: '更新' }); const 新 = state.读取快照('relations').数据; assert.deepEqual(新.扩展, 值.扩展); assert.deepEqual(新.关系[0].扩展, { 原样: true }) }))
测('两个快照交错保存拒绝旧版本覆盖', () => 用库(({ state }) => { const a = state.创建后端('relations'), b = state.创建后端('relations'); a.读取(); b.读取(); a.保存(图数据()); assert.throws(() => b.保存(图数据()), { message: 'SQLITE_STATE_VERSION_CONFLICT' }); assert.equal(b.读取().关系.length, 1) }))
测('重复编号触发真SQL约束，文档与所有投影整体回滚', () => 用库(({ state }) => { const a = state.创建后端('relations'); a.读取(); const 值 = 图数据(); 值.关系.push(拷(值.关系[0])); assert.throws(() => a.保存(值)); assert.equal(a.读取(), null); assert.equal(state.核验().投影数, 0) }))
测('未知版本/坏结构/getter/不安全整数不变成空状态', () => 用库(({ state }) => { const a = state.创建后端('relations'); a.读取(); let 执行 = false; assert.throws(() => a.保存({ get 格式版本() { 执行 = true; return 2 } })); assert.equal(执行, false); assert.throws(() => a.保存({ ...图数据(), 格式版本: 99 })); assert.throws(() => a.保存({ ...图数据(), 扩展: { 值: 9007199254740992 } })); assert.equal(a.读取(), null) }))
测('关系删除和抑制在原图谱引擎中一起存入SQLite', () => 用库(({ state }) => {
  const 库 = 图(state), 候选 = { 类型: '同一主题', 从: { 类别: '事实', 编号: 'a' }, 到: { 类别: '经历', 编号: 'b' }, 置信度: 1, 依据: 'fixture' }
  const 回 = 库.应用自动候选({ 候选们: [候选] }); assert.equal(回.新增数, 1); assert.equal(库.删除(回.关系[0].编号).好, true); assert.equal(图(state).应用自动候选({ 候选们: [候选] }).新增数, 0); const 数据 = state.读取快照('relations').数据; assert.equal(数据.关系.length, 0); assert.equal(数据.自动抑制.length, 1)
}))
测('原图谱修改/人工确认和布局规则保持，方向不翻转', () => 用库(({ state }) => {
  const 库 = 图(state), 回 = 库.新增({ 类型: '先于', 从: { 类别: '事实', 编号: 'a' }, 到: { 类别: '经历', 编号: 'b' } }); assert.equal(回.好, true)
  assert.equal(库.修改({ 编号: 回.关系.编号, 类型: '后续发展' }).好, true); assert.equal(state.读取快照('relations').数据.关系[0].从.编号, 'a')
  assert.equal(库.保存布局({ 节点: { '事实:a': { x: 30, y: 40 } }, 视图: { x: 1, y: 2, 缩放: 0.82 } }).好, true); assert.equal(state.读取快照('relation-layout').数据.节点['事实:a'].x, 30)
}))
测('投影失败保留既有边和人工删除抑制', () => 用库(({ state, db }) => { const a = state.创建后端('relations'); a.读取(); a.保存(图数据()); const 原 = a.读取(); db.exec("CREATE TEMP TRIGGER fail_item BEFORE INSERT ON state_items BEGIN SELECT RAISE(ABORT,'PRIVATE'); END"); const 值 = 图数据(); 值.关系 = []; 值.自动抑制 = [{ 签名: 'fixture', 时间, 原因: '手动删除' }]; assert.throws(() => a.保存(值)); assert.deepEqual(a.读取(), 原) }))
测('共享/私密同周期分别保存，默认读取与导出完全排除private', () => 用库(({ diary }) => { assert.equal(diary.写入共享({ 日记: 篇(), 预期版本: 0 }).好, true); assert.equal(diary.写入私密({ 日记: 篇(true), 预期版本: 0 }).好, true); const 文 = JSON.stringify(diary.导出共享()); assert.equal(diary.读取共享().length, 1); assert.equal(文.includes('却只陪你坐'), false); assert.equal(文.includes('私密日'), false); assert.equal(diary.读取本机私密(本机).length, 1); assert.equal(diary.核验().好, true) }))
测('旧共享缺可见性只读兼容，非法/私密值不能降级共享', () => 用库(({ diary }) => { const 值 = 篇(); delete 值.可见性; assert.equal(diary.写入共享({ 日记: 值, 预期版本: 0 }).好, true); for (const visibility of ['private', '', null, 'public']) assert.equal(diary.写入共享({ 日记: { ...篇(), 可见性: visibility }, 预期版本: 1 }).好, false); assert.equal(diary.读取共享()[0].日记.可见性, 'shared') }))
测('私密读取/评估/删除必须明确本机范围，无法走辅助状态口', () => 用库(({ diary, state }) => { assert.equal(diary.写入私密({ 日记: 篇(true), 预期版本: 0 }).好, true); assert.throws(() => diary.读取本机私密(), { message: 'SQLITE_DIARY_LOCAL_SCOPE_REQUIRED' }); assert.throws(() => diary.读取本机评估()); assert.equal(diary.删除私密({ 编号: 篇(true).编号, 预期版本: 1, 时间 }).好, false); assert.throws(() => state.读取快照('private-evaluations')) }))
测('每天私密一篇，不覆盖既有内容；重提相同结果不重复写', () => 用库(({ diary }) => { const 一 = 篇(true); assert.equal(diary.写入私密({ 日记: 一, 预期版本: 0 }).版本, 1); assert.equal(diary.写入私密({ 日记: 一, 预期版本: 0 }).写入, false); assert.equal(diary.写入私密({ 日记: { ...一, 标题: '另一篇' }, 预期版本: 1 }).代码, 'SQLITE_DIARY_ALREADY_EXISTS') }))
测('私密删除只留周期标记，同步评估且后续不得重建', () => 用库(({ diary, db }) => {
  const 一 = 篇(true); diary.写入私密({ 日记: 一, 预期版本: 0 })
  assert.equal(diary.删除私密({ 编号: 一.编号, 预期版本: 1, 时间 }, 本机).好, true)
  assert.equal(diary.读取本机私密(本机).length, 0)
  assert.equal(diary.读取本机评估(本机)[0].评估.状态, '已删除')
  const 标记 = db.prepare("SELECT record_json FROM diary_deleted WHERE visibility='private'").all()
  assert.equal(标记.length, 1)
  assert.deepEqual(JSON.parse(标记[0].record_json), { 格式版本: 1, 编号: 一.编号, 类型: 一.类型, 周期: 一.周期, 可见性: 'private' })
  const 剩余 = JSON.stringify([标记, db.prepare('SELECT record_json FROM diary_private_evaluations').all()])
  for (const 字段 of ['标题', '正文', '来源', 一.标题, 一.模块[0].正文]) assert.equal(剩余.includes(字段), false)
  assert.equal(diary.写入私密({ 日记: 一, 预期版本: 0 }).代码, 'SQLITE_DIARY_DELETED')
  assert.equal(diary.核验().好, true)
}))
测('私密删除失败整体回滚，原正文与评估不丢失', () => 用库(({ diary, db }) => { const 一 = 篇(true); diary.写入私密({ 日记: 一, 预期版本: 0 }); db.exec("CREATE TEMP TRIGGER fail_eval BEFORE UPDATE ON diary_private_evaluations BEGIN SELECT RAISE(ABORT,'PRIVATE'); END"); assert.equal(diary.删除私密({ 编号: 一.编号, 预期版本: 1, 时间 }, 本机).状态, 'rolled-back'); assert.equal(diary.读取本机私密(本机).length, 1); assert.equal(diary.读取本机评估(本机)[0].评估.状态, '已生成'); assert.equal(db.prepare('SELECT count(*) AS n FROM diary_deleted').get().n, 0) }))
测('共享正文与任务索引一事务，失败不留下半篇', () => 用库(({ diary, db }) => { db.exec("CREATE TEMP TRIGGER fail_index BEFORE INSERT ON state_documents WHEN NEW.kind='diary-index' BEGIN SELECT RAISE(ABORT,'no'); END"); assert.equal(diary.写入共享({ 日记: 篇(), 预期版本: 0 }).状态, 'rolled-back'); assert.equal(diary.读取共享().length, 0) }))
测('共享编辑保留来源/原时间，自动任务不覆盖人工修改', () => 用库(({ diary }) => { const 一 = 篇(); diary.写入共享({ 日记: 一, 预期版本: 0 }); assert.equal(diary.修改共享({ 编号: 一.编号, 预期版本: 1, 时间, 标题: '你改过的日记', 模块: 一.模块 }).版本, 2); const 自动 = diary.写入共享({ 日记: { ...一, 标题: '自动新稿' }, 预期版本: 2 }); assert.equal(自动.写入, false); assert.equal(diary.读取共享()[0].日记.标题, '你改过的日记'); assert.equal(diary.读取共享()[0].日记.生成于, 一.生成于) }))
测('共享删除留下索引标记且不会重新生成，旧编辑版本拒绝', () => 用库(({ diary, state, db }) => { const 一 = 篇(); diary.写入共享({ 日记: 一, 预期版本: 0 }); assert.equal(diary.修改共享({ 编号: 一.编号, 预期版本: 0, 时间, 标题: '旧稿', 模块: 一.模块 }).代码, 'SQLITE_DIARY_VERSION_CONFLICT'); diary.删除共享({ 编号: 一.编号, 预期版本: 1, 时间 }); assert.equal(state.读取快照('diary-index').数据.任务[0].状态, '已删除'); assert.equal(db.prepare('SELECT record_json FROM diary_deleted').get().record_json.includes('正文'), false); assert.equal(diary.写入共享({ 日记: 一, 预期版本: 0 }).代码, 'SQLITE_DIARY_DELETED'); assert.equal(diary.核验().好, true) }))
测('保存拒绝换周期、伪造来源和坏模块', () => 用库(({ diary }) => { const 一 = 篇(); diary.写入共享({ 日记: 一, 预期版本: 0 }); assert.equal(diary.写入共享({ 日记: { ...一, 周期: '2026-10-24' }, 预期版本: 1 }).代码, 'SQLITE_DIARY_PERIOD_IMMUTABLE'); assert.equal(diary.修改共享({ 编号: 一.编号, 预期版本: 1, 时间, 标题: '新稿', 模块: [{ 名字: '陪伴片段', 正文: '正文', 来源: ['fake-source'] }] }).好, false) }))
测('私密敏感/助手式/隐藏凭据字段拒绝', () => 用库(({ diary }) => { for (const 改 of [{ 模块: [{ 名字: '陪伴片段', 正文: '建议你多休息。', 来源: ['source-a'] }] }, { 标题: '密码：占位示例' }, { 扩展: { 账号: '占位示例' } }]) assert.equal(diary.写入私密({ 日记: { ...篇(true), ...改 }, 预期版本: 0 }).好, false); assert.equal(diary.读取本机私密(本机).length, 0) }))
测('默认导出白名单排除扩展原文和本机路径字段', () => 用库(({ diary }) => { const 一 = 篇(); 一.聊天全文 = 'RAW-SENTINEL'; 一.来源[0].文件路径 = 'PATH-SENTINEL'; diary.写入共享({ 日记: 一, 预期版本: 0 }); const 导出 = diary.导出共享; assert.equal(JSON.stringify(导出()).includes('SENTINEL'), false) }))
测('没有微妙波动可只记终态而不写日记，旧版本不能覆盖', () => 用库(({ diary }) => { const 评 = { 周期: '2026-10-25', 状态: '没有微妙情绪波动', 更新于: 时间, 尝试次数: 1, 预期版本: 0 }; assert.equal(diary.记录私密评估(评).好, true); assert.equal(diary.读取本机私密(本机).length, 0); assert.equal(diary.记录私密评估({ ...评, 状态: '失败待重试' }).代码, 'SQLITE_DIARY_VERSION_CONFLICT'); assert.equal(diary.写入私密({ 日记: 篇(true), 预期版本: 0 }).代码, 'SQLITE_DIARY_TERMINAL_STATE'); assert.equal(diary.读取本机私密(本机).length, 0) }))
测('重试评估只存有限元数据，新终态不反退', () => 用库(({ diary }) => {
  const 评 = { 周期: '2026-10-25', 状态: '失败待重试', 更新于: 时间, 尝试次数: 2, 下次尝试: '2026-10-26T00:05:00.000Z', 预期版本: 0 }
  assert.equal(diary.记录私密评估({ ...评, 正文: '不许落入评估索引' }).代码, 'SQLITE_DIARY_EVALUATION_METADATA_ONLY')
  for (const 尝试次数 of [-1, 101, 0.5]) assert.equal(diary.记录私密评估({ ...评, 尝试次数 }).好, false)
  assert.equal(diary.读取本机评估(本机).length, 0)
  assert.equal(diary.记录私密评估(评).好, true)
  assert.equal(diary.读取本机评估(本机)[0].评估.尝试次数, 2)
  assert.equal(diary.写入私密({ 日记: 篇(true), 预期版本: 0 }).好, true)
  assert.equal(diary.读取本机评估(本机)[0].评估.尝试次数, 2)
  assert.equal(diary.读取本机评估(本机)[0].评估.下次尝试, '')
  assert.equal(diary.记录私密评估({ ...评, 预期版本: 2 }).代码, 'SQLITE_DIARY_TERMINAL_STATE')
}))
测('后台缓冲/用量/工作与检查点未知字段完整保存', () => 用库(({ state }) => { const 数据们 = { 'extraction-buffer': { 版本: 1, 轮次: [{ 对话: 'chat-a', 消息编号: 'msg-a', 用户原话: '我们明天再聊。', 她的回复: '好呀。', 消息时间: 时间, 接收于: 时间 }] }, usage: [{ 时间, 输入: 12, 输出: 3 }, { 请求编号: 'r', 状态: 'unknown', 新字段: null }], 'work-index': { 任务: [], 扩展: { 原样: true } }, 'background-state': { 上次完成于: 时间, 下次检查: null }, 'cluster-state': { 候选: [], 输入版本: 'fixture' }, 'learning-index': { 课程: [], 其他: '' } }; for (const [类型, 数据] of Object.entries(数据们)) { const a = state.创建后端(类型); a.读取(); a.保存(数据); assert.deepEqual(a.读取(), 数据) }; assert.equal(state.核验().好, true) }))
测('任务后端独占且不允许关闭独占，释放后可新建', () => 用库(({ state }) => { const a = state.创建后端('channel-tasks'); assert.throws(() => state.创建后端('channel-tasks'), { message: 'SQLITE_STATE_LEASE_BUSY' }); assert.throws(() => state.创建后端('channel-tasks', 'x', { 独占: false })); a.关闭(); const b = state.创建后端('channel-tasks'); b.关闭() }))
测('同一后端不能挂两个任务实例，双路径存储拒绝且原实例可继续', () => 用库(async ({ state }) => { const a = 渠道(state); try { const 选项 = { 守卫: a.守卫, 权限: a.权限, 映射: a.映射, 存储: a.后端, 取现在: () => new Date(时间), 处理: async () => ({}) }; assert.throws(() => 创建渠道任务调度(选项), { message: 'TASK_BACKEND_IN_USE' }); assert.throws(() => 创建渠道任务调度({ ...选项, 文件: path.join(根, 'not-created.json') }), { message: 'TASK_BACKEND_INVALID' }); await a.适配器.注入接收(来信()); assert.equal(a.适配器.取观测().模拟送达数, 1) } finally { a.关闭() } }))
测('原渠道权限+映射+调度用SQLite去重，重建实例不重复送达', () => 用库(async ({ state }) => { const a = 渠道(state); await a.适配器.注入接收(来信()); await a.适配器.注入接收(来信()); assert.equal(a.核心数(), 1); assert.equal(a.适配器.取观测().模拟送达数, 1); const 编号 = state.读取快照('channel-map', 'map-tasks').数据.记录[0].内部对话编号; a.关闭(); const b = 渠道(state); try { await b.适配器.注入接收(来信()); assert.equal(b.核心数(), 0); assert.equal(b.适配器.取观测().模拟送达数, 0); assert.equal(state.读取快照('channel-map', 'map-tasks').数据.记录[0].内部对话编号, 编号) } finally { b.关闭() } }))
测('原渠道映射许可先于SQLite读取，陌生人不触碰映射', () => 用库(async ({ state }) => { const a = 渠道(state); try { await a.适配器.注入接收(来信({ 发送者编号: 'stranger' })); assert.equal(state.读取快照('channel-map', 'map-tasks').数据, null); assert.equal(a.核心数(), 0) } finally { a.关闭() } }))
测('SQLite任务实例恢复queued先等新许可，复用原草稿不再生成', () => 用库(async ({ state }) => {
  const a = 渠道(state); a.适配器.排入场景('failed'); await a.适配器.注入接收(来信()); assert.equal(a.调度.取任务状态()[0].状态, 'queued'); a.关闭()
  const b = 渠道(state); try { b.钟.毫秒 += 5000; await b.调度.推进(); assert.equal(b.适配器.取观测().模拟送达数, 0); await b.适配器.注入接收(来信({ 接收于: new Date(b.钟.毫秒).toISOString() })); assert.equal(b.核心数(), 0); assert.equal(b.适配器.取观测().模拟送达数, 1) } finally { b.关闭() }
}))
测('SQLite中sending恢复unknown，processing恢复interrupted，不重做', () => 用库(async ({ state }) => {
  for (const 模式 of ['sending', 'processing']) {
    let 放行; const 等 = new Promise((r) => { 放行 = r }), a = 渠道(state, { 名: 'old-' + 模式, 处理: 模式 === 'processing' ? async () => { await 等; return { 可见性: 'shared', 正文: '我在。', 附件: [] } } : undefined })
    if (模式 === 'sending') a.适配器.排入场景('manual')
    const 首 = a.适配器.注入接收(来信()); await 等待(() => a.调度.取任务状态()[0]?.状态 === 模式)
    const 快照 = state.读取快照('channel-tasks', 'old-' + 模式).数据; a.关闭(); 放行(); await Promise.allSettled([首])
    const 后端 = state.创建后端('channel-tasks', 'new-' + 模式); 后端.读取(); 后端.保存(快照); 后端.关闭()
    const b = 渠道(state, { 名: 'new-' + 模式 }); try { await b.调度.推进(); await b.适配器.注入接收(来信()); assert.equal(b.核心数(), 0); assert.equal(b.适配器.取观测().模拟送达数, 0); assert.equal(b.调度.取任务状态()[0].状态, 模式 === 'sending' ? 'unknown' : 'interrupted') } finally { b.关闭() }
  }
}))
测('SQLite任务写失败发生在处理前，核心/发送均不执行', () => 用库(async ({ state, db }) => { const a = 渠道(state); try { db.exec("CREATE TEMP TRIGGER fail_task BEFORE INSERT ON state_items WHEN NEW.row_kind='channel-task' BEGIN SELECT RAISE(ABORT,'PRIVATE'); END"); await a.适配器.注入接收(来信()); assert.equal(a.核心数(), 0); assert.equal(a.适配器.取观测().模拟送达数, 0) } finally { a.关闭() } }))
测('投影/哈希损坏和未知schema不能当空库覆盖', () => 用库(({ ctx, state, db }) => { const a = state.创建后端('relations'); a.读取(); a.保存(图数据()); db.prepare("UPDATE state_items SET to_key='wrong'").run(); assert.throws(() => state.核验(), { message: 'SQLITE_STATE_INTEGRITY_FAILED' }); db.prepare("UPDATE state_documents SET sha256='wrong'").run(); assert.throws(() => a.读取(), { message: 'SQLITE_STATE_INTEGRITY_FAILED' }); db.prepare("UPDATE repository_meta SET value='99' WHERE key='state_schema'").run(); assert.throws(() => 创建状态仓储(ctx), { message: 'SQLITE_STATE_SCHEMA_INVALID' }) }))
测('状态文档消失后新建后端仍拒绝空表重建', () => 用库(({ state, db }) => { const a = state.创建后端('relations'); a.读取(); a.保存(图数据()); a.关闭(); db.exec('DELETE FROM state_documents'); const b = state.创建后端('relations'); assert.throws(() => b.读取(), { message: 'SQLITE_STATE_STORE_MISSING' }); assert.throws(() => state.核验(), { message: 'SQLITE_STATE_INTEGRITY_FAILED' }) }))
测('已加载原图谱/渠道后，SQLite操作不调用业务文件API', () => 用库(async ({ state }) => {
  const 方法 = ['readFileSync', 'writeFileSync', 'openSync', 'mkdirSync', 'statSync', 'existsSync', 'renameSync', 'unlinkSync'], 原 = Object.fromEntries(方法.map((k) => [k, fs[k]])); for (const k of 方法) fs[k] = () => { throw new Error('BUSINESS_FILE_FORBIDDEN') }
  try { const 图库 = 图(state); assert.equal(图库.新增({ 类型: '同一主题', 从: { 类别: '事实', 编号: 'a' }, 到: { 类别: '经历', 编号: 'b' } }).好, true); const a = 渠道(state); try { await a.适配器.注入接收(来信()); assert.equal(a.适配器.取观测().模拟送达数, 1) } finally { a.关闭() } }
  finally { for (const k of 方法) fs[k] = 原[k] }
}))
测('独立Node进程阻断文件/配置/网络后可保存私密且共享导出为空', () => { const 输出 = execFileSync(process.execPath, [path.join(__dirname, 'fixtures/sqlite-state-audit.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 10000 }); assert.equal(输出.trim(), 'SQLITE_STATE_AUDIT_OK') })
测('提交后驱动异常封闭共享能力，不伪报回滚', () => 用库(({ state, db, ctx, diary }) => { const a = state.创建后端('relations'); a.读取(); const 原 = db.exec; db.exec = function (SQL) { const 果 = 原.call(this, SQL); if (SQL === 'COMMIT') throw new Error('PRIVATE-COMMIT'); return 果 }; assert.throws(() => a.保存(图数据()), { message: 'SQLITE_CONTEXT_COMMIT_UNKNOWN' }); assert.equal(ctx.取状态().可用, false); assert.equal(diary.写入共享({ 日记: 篇(), 预期版本: 0 }).状态, 'unknown'); db.exec = 原 }))
测('关闭后所有接口拒绝，不接收业务路径', () => 用库(({ state, ctx }) => { const a = state.创建后端('relations'); a.关闭(); assert.throws(() => a.读取(), { message: 'SQLITE_STATE_CLOSED' }); ctx.关闭(); assert.throws(() => state.核验(), { message: 'SQLITE_CONTEXT_CLOSED' }) }))
;(async () => { let 过 = 0; try { for (const [名, 做] of 测试) { try { await 做(); 过++; console.log(`PASS ${名}`) } catch (错) { console.error(`FAIL ${名} (${错.code === 'ERR_ASSERTION' ? 'assertion' : /^SQLITE_[A-Z_]+$/u.test(错.message || '') ? 错.message : 'test-error'})`) } }; console.log(`SQLite S-15D: ${过}/${测试.length}; synthetic only; no production wiring`); if (过 !== 测试.length) process.exitCode = 1 } finally { const 真 = fs.realpathSync(根); if (path.dirname(真).toLowerCase() === fs.realpathSync(os.tmpdir()).toLowerCase() && path.basename(真).startsWith('elysia-sqlite-D-')) fs.rmSync(真, { recursive: true, force: true }) } })()
