/** C-15：虚构身份与独立临时目录；不调用正式核心、模型、网络或真实数据。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const 契约 = require('../脑/渠道契约.cjs')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../脑/渠道权限.cjs')
const { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const { 创建渠道会话映射 } = require('../脑/渠道会话映射.cjs')
const { 创建渠道任务调度 } = require('../脑/渠道任务调度.cjs')
const 样例 = require('./fixtures/渠道契约-v1.json')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 接收 = (改 = {}) => ({ ...拷贝(样例.本人私聊), 端点: { 渠道: 'fake', 账号: 'local-fixture' }, ...改 })
const 第二人 = () => 接收({ 会话: { 类型: 'private', 编号: 'second-dm' }, 发送者编号: 'second-person' })
const 草稿 = (正文 = '本地固定回复。') => ({ 可见性: 'shared', 正文, 附件: [] })
const 时钟 = () => ({ 毫秒: Date.parse('2026-10-25T05:00:10.000Z') })
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-channel-tasks-'))
const 文件于 = (名) => path.join(根, 名, 'tasks.json')
const 资源们 = []
const 请求于 = (消息 = 接收()) => 'c15-' + createHash('sha256').update(JSON.stringify(契约.接收去重键(消息))).digest('hex')
const 让步 = () => new Promise((好) => setImmediate(好))
async function 等待(条件) { for (let i = 0; i < 100; i++) { if (条件()) return; await 让步() }; assert.fail('ISOLATED_WAIT_TIMEOUT') }
function 组合({ 文件 = null, 钟 = 时钟(), 处理, 参数 = {}, 权限参数 = {}, 改守卫 = (一) => 一 } = {}) {
  const 取现在 = () => new Date(钟.毫秒), 来信们 = [], 上下文们 = []
  const 权限 = 创建渠道权限({ 绑定: [接收(), 第二人()].map((消息) => ({ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false })), 取现在, ...权限参数 })
  const 适配器 = 创建假渠道适配器({ 取现在 }), 原守卫 = 创建渠道权限守卫({ 适配器, 权限, 取现在 })
  const 映射 = 创建渠道会话映射({ 权限, 文件: 文件 === null ? null : path.join(path.dirname(文件), 'mapping.json') })
  const 一 = { 权限, 适配器, 原守卫, 映射, 钟, 来信们, 上下文们, 调度: null }
  资源们.push(一)
  一.调度 = 创建渠道任务调度({ 守卫: 改守卫(原守卫), 权限, 映射, 文件, 取现在, ...参数,
    处理: async (消息, 上下文) => { 来信们.push(消息); 上下文们.push(上下文); return 处理 ? 处理(消息, 上下文, 一) : 草稿() },
  })
  一.调度.启动(); return 一
}
function 关闭(一) { try { 一.调度?.关闭() } finally { 一.原守卫.关闭(); 一.权限.关闭(); 一.适配器.关闭(); 一.映射.关闭() } }
function 状态(一) { return 一.调度.取任务状态() }
function 崩溃子进程(名, 模式) {
  const 文件 = 文件于(名), 子目录 = path.dirname(文件)
  execFileSync(process.execPath, [path.resolve(__dirname, 'fixtures/渠道调度崩溃.cjs'), 子目录, 模式], { windowsHide: true, timeout: 3000, stdio: 'pipe' })
  assert(fs.existsSync(文件 + '.lock'))
  // execFileSync已确认该测试子进程结束，才清理它在明确隔离目录留下的锁；模块本身不自动接管锁。
  fs.unlinkSync(文件 + '.lock')
  return 文件
}
let 总数 = 0
async function 检查(说明, 做) { await 做(); 总数++; console.log('✓ ' + 说明) }

async function main() {
  await 检查('相同输入及接收时间变化的重放只处理和回复一次', async () => {
    const 一 = 组合()
    for (const 改 of [{}, {}, { 接收于: '2026-10-25T05:00:11.000Z' }]) assert.equal((await 一.适配器.注入接收(接收(改))).好, true)
    assert.equal(一.来信们.length, 1); assert.equal(一.适配器.取观测().模拟送达数, 1)
    assert.equal(状态(一)[0].状态, 'sent'); assert.equal(一.调度.取日志().filter((条) => 条.事件 === 'duplicate').length, 2)
  })
  await 检查('相同正文的新消息不是重放，发送受最小间隔限制', async () => {
    const 一 = 组合()
    await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(接收({ 消息编号: 'next' }))
    assert.equal(一.来信们.length, 2); assert.equal(一.适配器.取观测().模拟送达数, 1)
    一.钟.毫秒 += 999; await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 1)
    一.钟.毫秒++; await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 2)
  })
  await 检查('不同已批准身份相同消息编号分别处理且内部上下文隔离', async () => {
    const 一 = 组合(); await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(第二人())
    一.钟.毫秒 += 1000; await 一.调度.推进()
    assert.equal(一.来信们.length, 2); assert.notEqual(一.上下文们[0].内部对话编号, 一.上下文们[1].内部对话编号)
    assert.equal(一.适配器.取观测().模拟送达数, 2)
    assert.equal(一.上下文们[0].回复许可, undefined); assert(Object.isFrozen(一.上下文们[0]))
  })
  await 检查('陌生人和群聊不进入处理、队列或发送', async () => {
    const 一 = 组合()
    for (const 消息 of [接收({ 发送者编号: 'stranger' }), 接收({ 会话: { 类型: 'group', 编号: 'dm-fixture' } })]) await 一.适配器.注入接收(消息)
    assert.equal(一.来信们.length, 0); assert.equal(状态(一).length, 0); assert.equal(一.适配器.取观测().模拟送达数, 0)
  })
  await 检查('并发重放在处理尚未完成时也不会重复调用核心', async () => {
    let 放行; const 等 = new Promise((好) => { 放行 = 好 }), 一 = 组合({ 处理: async () => { await 等; return 草稿() } })
    const 首 = 一.适配器.注入接收(接收()); await 等待(() => 一.来信们.length === 1)
    await 一.适配器.注入接收(接收()); assert.equal(一.来信们.length, 1)
    放行(); await 首; assert.equal(一.适配器.取观测().模拟送达数, 1)
  })
  await 检查('慢发送期间只有一个在途任务，推进重入不并发发送', async () => {
    const 一 = 组合(); 一.适配器.排入场景('manual')
    const 首 = 一.适配器.注入接收(接收()); await 等待(() => 一.适配器.取观测().待完成数 === 1)
    const 二消息 = 接收({ 消息编号: 'next' }), 二 = 一.适配器.注入接收(二消息)
    const 推们 = [一.调度.推进(), 一.调度.推进()]
    await 等待(() => 一.来信们.length === 2)
    assert.equal(一.适配器.取观测().待完成数, 1); assert.equal(状态(一).filter((条) => 条.状态 === 'sending').length, 1)
    一.适配器.完成发送(请求于()); await Promise.all([首, 二, ...推们])
    assert.equal(一.适配器.取观测().模拟送达数, 1)
    一.钟.毫秒 += 1000; await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 2)
  })
  await 检查('同编号内容冲突不改写已发回复或重新调用核心', async () => {
    const 一 = 组合(); await 一.适配器.注入接收(接收())
    await 一.适配器.注入接收(接收({ 正文: 'DIFFERENT-BODY' }))
    assert.equal(一.来信们.length, 1); assert.equal(状态(一)[0].状态, 'sent'); assert.equal(一.适配器.取观测().模拟送达数, 1)
    assert.equal(一.调度.取日志().at(-1).代码, 'MESSAGE_CONFLICT')
  })
  await 检查('待发任务遭遇同编号不同正文时阻止发送，不偷换载荷', async () => {
    const 一 = 组合(); 一.适配器.排入场景('failed'); await 一.适配器.注入接收(接收())
    await 一.适配器.注入接收(接收({ 正文: 'DIFFERENT-BODY' })); 一.钟.毫秒 += 10000; await 一.调度.推进()
    assert.equal(状态(一)[0].状态, 'blocked'); assert.equal(状态(一)[0].代码, 'MESSAGE_CONFLICT'); assert.equal(一.适配器.取观测().模拟送达数, 0)
  })
  await 检查('确定失败按退避限次重试，复用原请求编号和回复，不重新生成', async () => {
    const 一 = 组合(); 一.适配器.排入场景('failed'); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].尝试, 1)
    一.钟.毫秒 += 1999; await 一.调度.推进(); assert.equal(状态(一)[0].尝试, 1)
    一.钟.毫秒++; await 一.调度.推进(); assert.equal(状态(一)[0].尝试, 2)
    一.钟.毫秒 += 3999; await 一.调度.推进(); assert.equal(状态(一)[0].尝试, 2)
    一.钟.毫秒++; await 一.调度.推进(); assert.equal(状态(一)[0].状态, 'sent')
    assert.equal(new Set(一.适配器.取发送记录().map((条) => 条.请求编号)).size, 1); assert.equal(一.来信们.length, 1)
  })
  await 检查('达到尝试上限停止，即使继续推进和重放也不重发', async () => {
    const 一 = 组合({ 参数: { 最大尝试: 2 } }); 一.适配器.排入场景('failed'); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); 一.钟.毫秒 += 2000; await 一.调度.推进()
    assert.equal(状态(一)[0].状态, 'failed'); assert.equal(状态(一)[0].尝试, 2)
    一.钟.毫秒 += 10000; await 一.调度.推进(); await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].尝试, 2)
  })
  await 检查('重启收紧容量或尝试上限不会把合法旧存档当损坏或再次发送', async () => {
    const 文件 = 文件于('stricter-config'), 一 = 组合({ 文件 }); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(第二人()); 关闭(一)
    const 二 = 组合({ 文件, 参数: { 最大记录数: 1, 最大尝试: 1 } }); await 二.调度.推进()
    assert.equal(状态(二).length, 2); assert.equal(状态(二)[0].状态, 'failed'); assert.equal(状态(二)[0].代码, 'RETRY_EXHAUSTED')
    assert.equal(二.适配器.取观测().模拟送达数, 0)
    assert.equal((await 二.适配器.注入接收(接收({ 消息编号: 'new-after-full' }))).好, false)
  })
  await 检查('同会话先前重试未完成时后续回复不能越过', async () => {
    const 一 = 组合(); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(接收({ 消息编号: 'later' }))
    一.钟.毫秒 += 1000; await 一.调度.推进(); assert.equal(状态(一)[1].尝试, 0)
    一.钟.毫秒 += 1000; await 一.调度.推进(); assert.equal(状态(一)[0].状态, 'sent'); assert.equal(状态(一)[1].尝试, 0)
    一.钟.毫秒 += 1000; await 一.调度.推进(); assert.equal(状态(一)[1].状态, 'sent')
  })
  await 检查('离线失败后重连可恢复原任务，仅产生一次实际送达', async () => {
    const 一 = 组合({ 处理: (_, __, 资源) => { 资源.适配器.设连接(false); return 草稿() } })
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].代码, 'CHANNEL_OFFLINE')
    一.适配器.设连接(true); 一.钟.毫秒 += 2000; await 一.调度.推进()
    assert.equal(状态(一)[0].状态, 'sent'); assert.equal(一.来信们.length, 1); assert.equal(一.适配器.取观测().模拟送达数, 1)
  })
  await 检查('结果未知永久保留，不因重放、继续推进或重启而盲目重发', async () => {
    const 文件 = 文件于('unknown'), 一 = 组合({ 文件 }); 一.适配器.排入场景('unknown')
    await 一.适配器.注入接收(接收()); 一.钟.毫秒 += 10000; await 一.调度.推进(); await 一.适配器.注入接收(接收())
    assert.equal(状态(一)[0].状态, 'unknown'); assert.equal(状态(一)[0].尝试, 1); 关闭(一)
    const 二 = 组合({ 文件 }); await 二.适配器.注入接收(接收()); await 二.调度.推进()
    assert.equal(二.来信们.length, 0); assert.equal(二.适配器.取观测().发送尝试数, 0); assert.equal(状态(二)[0].状态, 'unknown')
  })
  await 检查('能力不支持的确定失败不重试', async () => {
    const 一 = 组合({ 处理: (_, __, 资源) => { 资源.适配器.设能力({ ...资源.适配器.取能力(), 回复: 'unsupported' }); return 草稿() } })
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].代码, 'CAPABILITY_UNSUPPORTED')
    一.钟.毫秒 += 10000; await 一.调度.推进(); assert.equal(状态(一)[0].尝试, 1)
  })
  await 检查('平台限流回执只在退避后重试', async () => {
    let 次数 = 0
    const 一 = 组合({ 改守卫: (守卫) => ({ ...守卫, 发送: async (消息, 上下文) => ++次数 === 1 ? { 版本: 1, 端点: 消息.端点, 请求编号: 消息.请求编号, 状态: 'failed', 渠道消息编号: null, 错误代码: 'RATE_LIMITED', 可重试: true, 结束于: '2026-10-25T05:00:10.000Z' } : 守卫.发送(消息, 上下文) }) })
    await 一.适配器.注入接收(接收()); await 一.调度.推进(); assert.equal(次数, 1)
    一.钟.毫秒 += 2000; await 一.调度.推进(); assert.equal(状态(一)[0].状态, 'sent')
  })
  await 检查('任务过期即停止，不因新重放延长有效期', async () => {
    const 一 = 组合({ 参数: { 任务有效毫秒: 1000 } }); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); 一.钟.毫秒 += 1000; await 一.调度.推进(); await 一.适配器.注入接收(接收())
    assert.equal(状态(一)[0].状态, 'expired'); assert.equal(状态(一)[0].尝试, 1)
  })
  await 检查('许可自然过期须等可信新重放，不能从存档补发授权', async () => {
    const 一 = 组合({ 权限参数: { 回复许可毫秒: 10 } }); 一.适配器.排入场景('failed')
    await 一.适配器.注入接收(接收()); 一.钟.毫秒 += 2000; await 一.调度.推进(); assert.equal(状态(一)[0].尝试, 1)
    await 一.适配器.注入接收(接收({ 接收于: new Date(一.钟.毫秒).toISOString() }))
    assert.equal(状态(一)[0].状态, 'sent'); assert.equal(一.来信们.length, 1)
  })
  await 检查('撤权冻结待发任务，重新添加本人也不会恢复旧任务', async () => {
    const 一 = 组合(); 一.适配器.排入场景('failed'); await 一.适配器.注入接收(接收())
    一.权限.更新绑定([]); assert.equal(状态(一)[0].状态, 'blocked')
    const 消息 = 接收(); 一.权限.更新绑定([{ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false }])
    一.钟.毫秒 += 2000; await 一.适配器.注入接收(消息); await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 0)
  })
  await 检查('生成期间撤权传播中止并丢弃迟到草稿，不进入队列', async () => {
    let 放行; const 等 = new Promise((好) => { 放行 = 好 }), 文件 = 文件于('revoke-core')
    const 一 = 组合({ 文件, 处理: async () => { await 等; return 草稿('LATE-PRIVATE-MARKER') } })
    const 任务 = 一.适配器.注入接收(接收()); await 等待(() => 一.来信们.length === 1)
    一.权限.更新绑定([]); assert.equal(一.上下文们[0].中止.aborted, true)
    放行(); await 任务; assert.equal(状态(一)[0].状态, 'blocked'); assert(!fs.readFileSync(文件, 'utf8').includes('LATE-PRIVATE'))
  })
  await 检查('发送过程中撤权中止未交付fake任务，不伪报送达', async () => {
    const 一 = 组合(); 一.适配器.排入场景('manual')
    const 任务 = 一.适配器.注入接收(接收()); await 等待(() => 一.适配器.取观测().待完成数 === 1)
    一.权限.更新绑定([]); await 任务
    assert.equal(状态(一)[0].状态, 'cancelled'); assert.equal(一.适配器.取观测().模拟送达数, 0)
  })
  await 检查('已送达记录跨实例保留去重，不再调用处理或发送', async () => {
    const 文件 = 文件于('sent-restart'), 一 = 组合({ 文件 }); await 一.适配器.注入接收(接收()); 关闭(一)
    const 二 = 组合({ 文件 }); await 二.适配器.注入接收(接收())
    assert.equal(二.来信们.length, 0); assert.equal(二.适配器.取观测().模拟送达数, 0); assert.equal(状态(二)[0].状态, 'sent')
  })
  await 检查('独立进程遗留的待发任务重启后先等来源重放，再发送原回复', async () => {
    const 文件 = 崩溃子进程('child-queued', 'queued'), 钟 = 时钟(); 钟.毫秒 += 2000
    const 一 = 组合({ 文件, 钟 }); await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 0)
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].状态, 'sent')
    assert.equal(一.来信们.length, 0); assert.equal(一.适配器.取观测().模拟送达数, 1)
  })
  await 检查('重启不能重置发送间隔，已有待发回复仍须等到原时间', async () => {
    const 文件 = 文件于('restart-rate'), 钟 = 时钟(), 一 = 组合({ 文件, 钟 }), 二消息 = 接收({ 消息编号: 'later' })
    await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(二消息); 关闭(一)
    钟.毫秒 += 500; const 二 = 组合({ 文件, 钟 }); await 二.适配器.注入接收(二消息)
    assert.equal(二.适配器.取观测().模拟送达数, 0); assert.equal(二.来信们.length, 0)
    钟.毫秒 += 500; await 二.调度.推进(); assert.equal(二.适配器.取观测().模拟送达数, 1)
  })
  await 检查('有限平台回复窗口按原发生时间检查，重放不能续期', async () => {
    const 一 = 组合()
    一.适配器.设能力({ ...一.适配器.取能力(), 回复窗口: { 类型: 'seconds', 秒数: 1 } })
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].状态, 'failed'); assert.equal(状态(一)[0].代码, 'EXPIRED')
    await 一.适配器.注入接收(接收({ 接收于: new Date(一.钟.毫秒).toISOString() })); assert.equal(状态(一)[0].尝试, 1)
  })
  await 检查('核心生成超过任务期限时停止，不将迟到草稿误记为有效待发', async () => {
    const 一 = 组合({ 参数: { 任务有效毫秒: 1000 }, 处理: (_, __, 资源) => { 资源.钟.毫秒 += 1000; return 草稿() } })
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].状态, 'failed'); assert.equal(状态(一)[0].代码, 'EXPIRED'); assert.equal(状态(一)[0].尝试, 0)
  })
  await 检查('进程在核心处理中退出，重启记录interrupted而不重复执行', async () => {
    const 文件 = 崩溃子进程('child-processing', 'processing'), 一 = 组合({ 文件 })
    await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].状态, 'interrupted')
    assert.equal(一.来信们.length, 0); assert.equal(一.适配器.取观测().模拟送达数, 0)
  })
  await 检查('进程在sending阶段退出，重启视为unknown，不盲目重发', async () => {
    const 文件 = 崩溃子进程('child-sending', 'sending'), 一 = 组合({ 文件 })
    await 一.适配器.注入接收(接收()); await 一.调度.推进()
    assert.equal(状态(一)[0].状态, 'unknown'); assert.equal(一.来信们.length, 0); assert.equal(一.适配器.取观测().发送尝试数, 0)
  })
  await 检查('同一存档独占单写，不自动删除另一个实例的锁', () => {
    const 文件 = 文件于('exclusive'), 一 = 组合({ 文件 }), 原文 = fs.readFileSync(文件, 'utf8')
    assert.throws(() => 组合({ 文件 }), /TASK_STORE_BUSY/u)
    assert(fs.existsSync(文件 + '.lock')); assert.equal(fs.readFileSync(文件, 'utf8'), 原文); assert.equal(一.调度.取状态().已关闭, false)
  })
  await 检查('损坏存档、未来版本、重复记录、错误回执和private发送拒绝且不覆盖', async () => {
    const 模板文件 = 文件于('valid-template'), 一 = 组合({ 文件: 模板文件 }); await 一.适配器.注入接收(接收()); 关闭(一)
    const 模板 = JSON.parse(fs.readFileSync(模板文件, 'utf8'))
    const 坏们 = ['', '{broken', { ...模板, 版本: 2 }, { ...模板, 记录: [模板.记录[0], 模板.记录[0]] }]
    for (const 改 of [(条) => { 条.发送.可见性 = 'private' }, (条) => { 条.回执.请求编号 = 'other' }, (条) => { 条.状态 = 'queued' }, (条) => { 条.正文 = 'PRIVATE-SENTINEL' }]) { const 值 = 拷贝(模板); 改(值.记录[0]); 坏们.push(值) }
    for (const [i, 值] of 坏们.entries()) {
      const 文件 = 文件于('corrupt-' + i); fs.mkdirSync(path.dirname(文件), { recursive: true })
      const 原文 = typeof 值 === 'string' ? 值 : JSON.stringify(值); fs.writeFileSync(文件, 原文, 'utf8')
      assert.throws(() => 组合({ 文件 }), /TASK_STORE_CORRUPT/u); assert.equal(fs.readFileSync(文件, 'utf8'), 原文); assert.equal(fs.existsSync(文件 + '.lock'), false)
    }
  })
  await 检查('处理前存盘失败不调用核心或发送，也不覆盖旧档', async () => {
    const 文件 = 文件于('claim-fail'), 一 = 组合({ 文件 }), 原文 = fs.readFileSync(文件, 'utf8'), 原 = fs.renameSync
    try {
      fs.renameSync = (从, 到) => { if (到 === 文件) throw new Error('RAW-SECRET'); return 原(从, 到) }
      assert.equal((await 一.适配器.注入接收(接收())).好, false)
    } finally { fs.renameSync = 原 }
    assert.equal(一.来信们.length, 0); assert.equal(fs.readFileSync(文件, 'utf8'), 原文); assert.equal(一.适配器.取观测().模拟送达数, 0)
    assert.equal(一.调度.取状态().故障, 'TASK_STORE_WRITE_FAILED')
  })
  await 检查('送达后回执落盘失败，重启保留unknown，不重复发送', async () => {
    const 文件 = 文件于('receipt-fail'), 一 = 组合({ 文件 }), 原 = fs.renameSync
    try {
      fs.renameSync = (从, 到) => { if (到 === 文件 && JSON.parse(fs.readFileSync(从, 'utf8')).记录[0]?.状态 === 'sent') throw new Error('RAW-SECRET'); return 原(从, 到) }
      assert.equal((await 一.适配器.注入接收(接收())).好, false)
    } finally { fs.renameSync = 原 }
    assert.equal(一.适配器.取观测().模拟送达数, 1); assert.equal(JSON.parse(fs.readFileSync(文件, 'utf8')).记录[0].状态, 'sending')
    关闭(一); const 二 = 组合({ 文件 }); await 二.适配器.注入接收(接收())
    assert.equal(状态(二)[0].状态, 'unknown'); assert.equal(二.适配器.取观测().模拟送达数, 0)
  })
  await 检查('运行中存档消失会停止处理，不重建空表', async () => {
    const 文件 = 文件于('missing'), 一 = 组合({ 文件 }); fs.unlinkSync(文件)
    assert.equal((await 一.适配器.注入接收(接收())).好, false); assert.equal(一.来信们.length, 0); assert.equal(fs.existsSync(文件), false)
  })
  await 检查('private、额外字段、访问器和非法附件草稿不能进入待发存档', async () => {
    let 被读 = 0
    const 有访问器 = { 可见性: 'shared', 附件: [] }; Object.defineProperty(有访问器, '正文', { enumerable: true, get: () => { 被读++; return 'PRIVATE-SENTINEL' } })
    const 坏们 = [{ ...草稿('PRIVATE-SENTINEL'), 可见性: 'private' }, { ...草稿(), 私密日记: 'PRIVATE-SENTINEL' }, 有访问器, { ...草稿(), 附件: [{ 路径: 'PRIVATE-SENTINEL' }] }]
    for (const [i, 坏] of 坏们.entries()) {
      const 文件 = 文件于('private-' + i), 一 = 组合({ 文件, 处理: () => 坏 }); await 一.适配器.注入接收(接收())
      assert.equal(状态(一)[0].代码, 'INVALID_DRAFT'); assert.equal(一.适配器.取观测().模拟送达数, 0); assert(!fs.readFileSync(文件, 'utf8').includes('PRIVATE-SENTINEL'))
    }
    assert.equal(被读, 0)
  })
  await 检查('日记先过既有shared投影，private片段不进入发送与重试', async () => {
    const 文件 = 文件于('diary-gate')
    const 私密 = { 格式版本: 1, 编号: 'private-test', 类型: '日', 周期: '2026-10-25', 可见性: 'private', 标题: 'PRIVATE-SENTINEL', 模块: [{ 名字: '陪伴片段', 正文: 'PRIVATE-SENTINEL', 来源: [] }], 来源: [] }
    const 共享 = { 格式版本: 1, 编号: 'shared-test', 类型: '日', 周期: '2026-10-25', 可见性: 'shared', 标题: '一起整理', 模块: [{ 名字: '陪伴片段', 正文: '公开片段。', 来源: ['chat-fixture'] }], 来源: [{ 编号: 'chat-fixture', 类型: '聊天', 摘要: '我们一起整理了步骤。' }] }
    // 日记模块依赖配置：在独立子进程把配置/数据根指到隔离目录，主调度链不加载正式配置。
    const 载荷 = JSON.parse(execFileSync(process.execPath, ['-e', `
      const { 构建共享外发载荷 } = require(process.argv[1]);
      process.stdout.write(JSON.stringify(构建共享外发载荷({ 渠道: 'fake-local', 日记们: JSON.parse(process.argv[2]) })));
    `, path.resolve(__dirname, '../脑/日记外发闸门.cjs'), JSON.stringify([私密, 共享])], { encoding: 'utf8', timeout: 3000, windowsHide: true, env: { ...process.env, ELYSIA_WORKSPACE_ROOT: 根, ELYSIA_CONFIG_FILE: path.join(根, 'unused-fixture-config.json'), ELYSIA_DATA_DIR: path.join(根, 'unused-data') } }))
    assert(载荷); assert(!JSON.stringify(载荷).includes('PRIVATE-SENTINEL'))
    const 一 = 组合({ 文件, 处理: () => 草稿(JSON.stringify(载荷)) }); 一.适配器.排入场景('failed'); await 一.适配器.注入接收(接收())
    assert.equal(状态(一)[0].状态, 'queued'); assert(!fs.readFileSync(文件, 'utf8').includes('PRIVATE-SENTINEL'))
  })
  await 检查('核心异常不回显原始错误，不自动重复执行', async () => {
    const 文件 = 文件于('core-error'), 一 = 组合({ 文件, 处理: () => { throw new Error('PRIVATE-ERROR-CREDENTIAL') } })
    await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(接收())
    assert.equal(状态(一)[0].代码, 'PROCESSING_FAILED'); assert.equal(一.来信们.length, 1); assert(!fs.readFileSync(文件, 'utf8').includes('PRIVATE-ERROR'))
  })
  await 检查('日志与管理状态不含正文、身份、映射编号、异常或许可，返回副本', async () => {
    const 文件 = 文件于('logs'), 一 = 组合({ 文件, 处理: () => 草稿('OUTBOUND-SENTINEL') })
    await 一.适配器.注入接收(接收({ 正文: 'INBOUND-SENTINEL' }))
    const 日志 = 一.调度.取日志(), 字 = JSON.stringify([日志, 状态(一), 一.调度.取状态()])
    for (const 禁 of ['SENTINEL', 'person-fixture', 'dm-fixture', 'local-fixture', '回复许可', 'channel-']) assert(!字.includes(禁))
    for (const 条 of 日志) assert.deepEqual(Object.keys(条).sort(), ['于', '事件', '任务', '代码', '尝试'].sort())
    日志[0].事件 = 'injected'; assert.notEqual(一.调度.取日志()[0].事件, 'injected')
    assert(!fs.readFileSync(文件, 'utf8').includes('INBOUND-SENTINEL'))
  })
  await 检查('日志保留最近100条，去重记录不因日志裁剪被忘记', async () => {
    const 一 = 组合(); for (let i = 0; i < 105; i++) await 一.适配器.注入接收(接收())
    assert.equal(一.调度.取日志().length, 100); assert.equal(状态(一).length, 1); assert.equal(一.来信们.length, 1)
  })
  await 检查('容量满时拒绝新消息，保留旧去重记录', async () => {
    const 一 = 组合({ 参数: { 最大记录数: 1 } }); await 一.适配器.注入接收(接收())
    assert.equal((await 一.适配器.注入接收(接收({ 消息编号: 'new' }))).好, false)
    await 一.适配器.注入接收(接收()); assert.equal(一.来信们.length, 1); assert.equal(状态(一).length, 1)
  })
  await 检查('时钟倒退不会绕过发送间隔', async () => {
    const 一 = 组合(); await 一.适配器.注入接收(接收()); await 一.适配器.注入接收(第二人())
    一.钟.毫秒 -= 1000; await 一.调度.推进(); assert.equal(一.适配器.取观测().模拟送达数, 1)
    一.钟.毫秒 += 2000; await 一.适配器.注入接收(第二人()); assert.equal(一.适配器.取观测().模拟送达数, 2)
  })
  await 检查('关闭中止待完成发送，持久化unknown且迟到结果不能改写下一实例', async () => {
    const 文件 = 文件于('close-sending'), 一 = 组合({ 文件 }); 一.适配器.排入场景('manual')
    const 任务 = 一.适配器.注入接收(接收()); await 等待(() => 一.适配器.取观测().待完成数 === 1)
    一.调度.关闭(); const 二 = 组合({ 文件 }); await 任务
    assert.equal(状态(二)[0].状态, 'unknown'); assert.equal(一.适配器.取观测().待完成数, 0)
    assert.equal(二.来信们.length, 0); assert.equal(一.权限.取状态().已关闭, false)
  })
  await 检查('关闭中止核心且标记interrupted，迟到草稿不会写入新实例', async () => {
    let 放行; const 等 = new Promise((好) => { 放行 = 好 }), 文件 = 文件于('close-core')
    const 一 = 组合({ 文件, 处理: async () => { await 等; return 草稿('LATE-DRAFT-SENTINEL') } })
    const 任务 = 一.适配器.注入接收(接收()); await 等待(() => 一.来信们.length === 1); 一.调度.关闭()
    assert.equal(一.上下文们[0].中止.aborted, true)
    const 二 = 组合({ 文件 }); 放行(); await 任务
    assert.equal(状态(二)[0].状态, 'interrupted'); assert(!fs.readFileSync(文件, 'utf8').includes('LATE-DRAFT'))
  })
  await 检查('错误归属或异常发送回执降为unknown，日志无原始异常', async () => {
    for (const 发送 of [async () => { throw new Error('RAW-CREDENTIAL') }, async (消息) => ({ 版本: 1, 端点: 消息.端点, 请求编号: 'wrong', 状态: 'sent', 渠道消息编号: 'ack', 错误代码: null, 可重试: false, 结束于: '2026-10-25T05:00:10.000Z' })]) {
      const 一 = 组合({ 改守卫: (守卫) => ({ ...守卫, 发送 }) }); await 一.适配器.注入接收(接收()); assert.equal(状态(一)[0].状态, 'unknown'); assert(!JSON.stringify(一.调度.取日志()).includes('RAW-'))
    }
  })
  await 检查('启动幂等，关闭释放订阅和锁但不关闭共享依赖', async () => {
    const 文件 = 文件于('lifecycle'), 一 = 组合({ 文件 }); 一.调度.启动(); 一.调度.启动()
    assert.equal(一.适配器.取观测().订阅数, 1); 一.调度.关闭(); 一.调度.关闭()
    assert.equal(一.适配器.取观测().订阅数, 0); assert.equal(fs.existsSync(文件 + '.lock'), false)
    assert.equal(一.权限.取状态().已关闭, false); assert.equal(一.映射.取状态().已关闭, false); assert.equal(一.适配器.取观测().已关闭, false)
    assert.throws(() => 一.调度.启动(), /TASK_CLOSED/u); await assert.rejects(一.调度.推进(), /TASK_CLOSED/u)
  })
  await 检查('同一守卫不能重复挂两个调度实例，未启动实例关闭不释放他人的占用', async () => {
    const 一 = 组合(), 二 = 创建渠道任务调度({ 守卫: 一.原守卫, 权限: 一.权限, 映射: 一.映射, 处理: () => 草稿() })
    assert.throws(() => 二.启动(), /TASK_GUARD_IN_USE/u); 二.关闭()
    const 三 = 创建渠道任务调度({ 守卫: 一.原守卫, 权限: 一.权限, 映射: 一.映射, 处理: () => 草稿() })
    assert.throws(() => 三.启动(), /TASK_GUARD_IN_USE/u); 三.关闭()
    await 一.适配器.注入接收(接收()); assert.equal(一.来信们.length, 1); assert.equal(一.适配器.取观测().模拟送达数, 1)
  })
  await 检查('无效控频、重试、容量、时间和文件配置在接收前拒绝', () => {
    const 一 = 组合(), 依赖 = { 守卫: 一.原守卫, 权限: 一.权限, 映射: 一.映射, 处理: () => 草稿() }
    for (const 改 of [{ 最小间隔毫秒: 0 }, { 重试延迟毫秒: -1 }, { 最大尝试: 6 }, { 任务有效毫秒: 0 }, { 最大记录数: 4097 }]) assert.throws(() => 创建渠道任务调度({ ...依赖, ...改 }), /TASK_OPTIONS_INVALID/u)
    for (const 文件 of ['relative.json', path.join(根, 'wrong.txt'), 12]) assert.throws(() => 创建渠道任务调度({ ...依赖, 文件 }), /TASK_FILE_INVALID/u)
    assert.throws(() => 创建渠道任务调度({ ...依赖, 取现在: () => new Date('invalid') }), /TASK_CLOCK_INVALID/u)
    assert.equal(一.来信们.length, 0)
  })
  await 检查('构造时权限已经关闭，拒绝并释放刚取得的存档锁', () => {
    const 一 = 组合(), 文件 = 文件于('closed-policy'), 权限 = 创建渠道权限(); 权限.关闭()
    assert.throws(() => 创建渠道任务调度({ 守卫: 一.原守卫, 权限, 映射: 一.映射, 处理: () => 草稿(), 文件 }), /TASK_POLICY_CLOSED/u)
    assert.equal(fs.existsSync(文件 + '.lock'), false)
  })
  await 检查('配置、正式记忆和桌面主进程没有被隔离链加载', () => {
    const 禁 = new Set(['配置.cjs', '记忆.cjs', '主进程.cjs']); assert.equal(Object.keys(require.cache).some((文件) => 禁.has(path.basename(文件))), false)
    assert.throws(() => 创建渠道任务调度(), /TASK_DEPENDENCY_INVALID/u)
  })
  console.log(`\n渠道任务调度：${总数}/${总数}通过（fake、隔离存档和独立测试子进程，无生产接线）`)
}
const 看门狗 = setTimeout(() => { console.error('C15_TEST_TIMEOUT'); process.exit(1) }, 15000)
main().catch((错) => { console.error('C15_TEST_FAILED', 错.code || 错.message); process.exitCode = 1 }).finally(() => {
  clearTimeout(看门狗)
  for (const 一 of 资源们.reverse()) { try { 关闭(一) } catch {} }
  const 目标 = path.resolve(根), 临时根 = path.resolve(os.tmpdir()) + path.sep
  if (!目标.startsWith(临时根) || !path.basename(目标).startsWith('elysia-channel-tasks-')) throw new Error('C15_CLEANUP_PATH_INVALID')
  fs.rmSync(目标, { recursive: true, force: true })
})
