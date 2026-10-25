/** C-12：所有收发、失败、取消和时钟均为本地模拟；不使用真实模型、账号或数据。 */
'use strict'

const assert = require('node:assert/strict')
const { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const 契约 = require('../脑/渠道契约.cjs')
const 样例 = require('./fixtures/渠道契约-v1.json')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 端点 = { 渠道: 'fake', 账号: 'local-fixture' }
let 总数 = 0
async function 检查(说明, 执行) { await 执行(); 总数++; console.log('✓ ' + 说明) }
function 接收(改 = {}) { return { ...拷贝(样例.本人私聊), 端点: 拷贝(端点), ...改 } }
function 发送(改 = {}) { return { ...拷贝(样例.普通回复), 端点: 拷贝(端点), ...改 } }
function 取消(改 = {}) { return { ...拷贝(样例.取消本次请求), 端点: 拷贝(端点), ...改 } }
function 创建() { return 创建假渠道适配器({ 取现在: () => new Date('2026-10-25T05:00:10.000Z') }) }
function 改能力(适配器, 改) { 适配器.设能力({ ...适配器.取能力(), ...改 }) }

async function main() {
  await 检查('默认实例明确为fake，能力是契约合法且互不共享的快照', () => {
    const 一 = 创建(), 二 = 创建()
    契约.校验渠道能力(一.取能力())
    const 能力 = 一.取能力(); 能力.端点.账号 = 'changed'; 能力.回复窗口.类型 = 'unknown'
    assert.equal(一.取能力().端点.账号, 'local-fixture')
    assert.equal(二.取能力().回复窗口.类型, 'unlimited')
    assert.equal(一.取观测().实例类型, 'fake-local-only')
  })
  await 检查('不能把假适配器伪装成真实QQ端点', () => {
    assert.throws(() => 创建假渠道适配器({ 能力: 样例.主动能力未知 }), /FAKE_CHANNEL_ONLY/)
  })
  await 检查('订阅后注入一次消息只通知一次且不触发自动回复', async () => {
    const 一 = 创建(), 收到 = []
    一.订阅接收((消息) => 收到.push(消息))
    assert.deepEqual(await 一.注入接收(接收()), { 好: true, 错误代码: null, 通知数: 1, 失败数: 0 })
    assert.equal(收到.length, 1)
    assert.equal(一.取观测().发送尝试数, 0)
  })
  await 检查('不同订阅拿到独立副本，修改不会串到输入和其他订阅', async () => {
    const 一 = 创建(), 原 = 接收(); let 第二份
    一.订阅接收((消息) => { 消息.正文 = 'changed'; 消息.端点.账号 = 'changed' })
    一.订阅接收((消息) => { 第二份 = 消息 })
    await 一.注入接收(原)
    assert.equal(第二份.正文, 原.正文)
    assert.equal(第二份.端点.账号, 'local-fixture')
  })
  await 检查('同一个函数的两次订阅能分别取消，取消本身幂等', async () => {
    const 一 = 创建(); let 次数 = 0
    const 处理 = () => { 次数++ }
    const 停止 = 一.订阅接收(处理); 一.订阅接收(处理)
    停止(); 停止()
    await 一.注入接收(接收())
    assert.equal(次数, 1)
    assert.equal(一.取观测().订阅数, 1)
  })
  await 检查('订阅者失败被隔离，错误内容不进入报告且其他订阅仍收到', async () => {
    const 一 = 创建(); let 收到 = 0
    一.订阅接收(async () => { throw new Error('token=SECRET-SENTINEL') })
    一.订阅接收(() => { 收到++ })
    const 报告 = await 一.注入接收(接收())
    assert.equal(报告.错误代码, 'RECEIVER_FAILED')
    assert.equal(报告.失败数, 1)
    assert.equal(收到, 1)
    assert(!JSON.stringify(报告).includes('SENTINEL'))
  })
  await 检查('重放会再次上报并保持去重键，未冒充C-15生产去重', async () => {
    const 一 = 创建(), 收到 = []
    一.订阅接收((消息) => 收到.push(消息))
    await 一.注入接收(接收()); await 一.注入接收(接收({ 接收于: '2026-10-25T05:00:05.000Z' }))
    assert.equal(收到.length, 2)
    assert.equal(契约.接收去重键(收到[0]), 契约.接收去重键(收到[1]))
  })
  await 检查('端点不匹配或离线时不向订阅者交付', async () => {
    const 一 = 创建(); let 次数 = 0
    一.订阅接收(() => { 次数++ })
    assert.equal((await 一.注入接收(接收({ 端点: { ...端点, 账号: 'other' } }))).错误代码, 'ENDPOINT_MISMATCH')
    一.设连接(false)
    assert.equal((await 一.注入接收(接收())).错误代码, 'CHANNEL_OFFLINE')
    assert.equal(次数, 0)
  })
  await 检查('无效接收内容不会进入收件表或通知订阅者', async () => {
    const 一 = 创建(); let 次数 = 0
    一.订阅接收(() => { 次数++ })
    await assert.rejects(一.注入接收(接收({ 版本: 2 })), /CHANNEL_CONTRACT_INVALID/)
    assert.equal(一.取观测().接收注入次数, 0)
    assert.equal(次数, 0)
  })
  await 检查('纯内存接收到回复的完整链可跑通且没有真实核心', async () => {
    const 一 = 创建(), 回执们 = []
    一.订阅接收(async (消息) => {
      回执们.push(await 一.发送(发送({ 请求编号: 'loop-' + 消息.消息编号, 回复消息编号: 消息.消息编号, 正文: '虚构固定回复' })))
    })
    await 一.注入接收(接收())
    assert.equal(回执们.length, 1)
    assert.equal(回执们[0].状态, 'sent')
    契约.校验发送结果(回执们[0])
    assert.equal(一.取观测().模拟送达数, 1)
  })
  await 检查('模拟成功有确认编号，发送记录只保留回执且返回副本', async () => {
    const 一 = 创建()
    const 回执 = await 一.发送(发送({ 正文: 'BODY-SENTINEL' }))
    assert.equal(回执.状态, 'sent')
    assert.equal(回执.渠道消息编号, 'fake-ack-1')
    const 记录 = 一.取发送记录()
    assert(!JSON.stringify(记录).includes('BODY-SENTINEL'))
    记录[0].状态 = 'changed'
    assert.equal(一.取发送记录()[0].状态, 'sent')
  })
  await 检查('确定失败与未知结果分开，未知结果不自行重试', async () => {
    const 一 = 创建()
    一.排入场景('failed')
    const 失败 = await 一.发送(发送())
    assert.equal(失败.状态, 'failed'); assert.equal(失败.可重试, true)
    一.排入场景('unknown')
    const 未知 = await 一.发送(发送({ 请求编号: 'unknown-1' }))
    assert.equal(未知.状态, 'unknown'); assert.equal(未知.可重试, false)
    assert.equal(一.取观测().发送尝试数, 2)
    assert.equal(一.取观测().模拟送达数, 0)
  })
  await 检查('失败场景与实例数据互相隔离', async () => {
    const 一 = 创建(), 二 = 创建()
    一.排入场景('failed')
    assert.equal((await 一.发送(发送())).状态, 'failed')
    assert.equal((await 二.发送(发送())).状态, 'sent')
  })
  await 检查('回复能力不支持或未知时明确拒绝且不消耗场景', async () => {
    const 一 = 创建(); 一.排入场景('failed')
    for (const 回复 of ['unknown', 'unsupported']) {
      改能力(一, { 回复 })
      assert.equal((await 一.发送(发送())).错误代码, 'CAPABILITY_UNSUPPORTED')
    }
    改能力(一, { 回复: 'supported' })
    assert.equal((await 一.发送(发送())).错误代码, 'SEND_FAILED')
  })
  await 检查('主动发送默认不支持，只有显式模拟支持才可发送', async () => {
    const 一 = 创建(), 消息 = 发送({ 用途: 'proactive', 回复消息编号: null })
    assert.equal((await 一.发送(消息)).错误代码, 'CAPABILITY_UNSUPPORTED')
    改能力(一, { 主动发送: 'supported' })
    assert.equal((await 一.发送(消息)).状态, 'sent')
  })
  await 检查('渠道正文与附件能力比契约上限更小时仍按能力拒绝', async () => {
    const 一 = 创建()
    改能力(一, { 正文上限: 2 })
    assert.equal((await 一.发送(发送())).错误代码, 'CAPABILITY_UNSUPPORTED')
    const 附件 = { 编号: 'asset_1', 类型: 'image', 名称: '图.png', 媒体类型: 'image/png', 字节数: 1024 }
    改能力(一, { 正文上限: 2000 })
    assert.equal((await 一.发送(发送({ 附件: [附件] }))).错误代码, 'CAPABILITY_UNSUPPORTED')
    改能力(一, { 单次附件上限: 1, 附件类型: ['image'] })
    assert.equal((await 一.发送(发送({ 附件: [附件] }))).状态, 'sent')
  })
  await 检查('截止时间已到期时不模拟送达', async () => {
    const 一 = 创建()
    const 结果 = await 一.发送(发送({ 截止于: '2026-10-25T05:00:09.000Z' }))
    assert.equal(结果.错误代码, 'EXPIRED')
    assert.equal(一.取观测().模拟送达数, 0)
  })
  await 检查('有限回复窗口按原始发生时间判断，重放不会续期', async () => {
    const 一 = 创建()
    改能力(一, { 回复窗口: { 类型: 'seconds', 秒数: 5 } })
    await 一.注入接收(接收())
    await 一.注入接收(接收({ 发生于: '2026-10-25T05:00:09.000Z', 接收于: '2026-10-25T05:00:09.000Z' }))
    assert.equal((await 一.发送(发送())).错误代码, 'EXPIRED')
  })
  await 检查('回复窗口未知、来源缺失或来源时间未知均不猜测', async () => {
    const 一 = 创建()
    改能力(一, { 回复窗口: { 类型: 'unknown', 秒数: null } })
    assert.equal((await 一.发送(发送())).错误代码, 'CAPABILITY_UNSUPPORTED')
    改能力(一, { 回复窗口: { 类型: 'seconds', 秒数: 60 } })
    assert.equal((await 一.发送(发送())).错误代码, 'INVALID_MESSAGE')
    await 一.注入接收(接收({ 发生于: null }))
    assert.equal((await 一.发送(发送())).错误代码, 'INVALID_MESSAGE')
  })
  await 检查('原始回复来源按发送者隔离，不混用另一人的消息', async () => {
    const 一 = 创建()
    改能力(一, { 回复窗口: { 类型: 'seconds', 秒数: 60 } })
    await 一.注入接收(接收({ 发送者编号: 'other-person' }))
    assert.equal((await 一.发送(发送())).错误代码, 'INVALID_MESSAGE')
    await 一.注入接收(接收())
    assert.equal((await 一.发送(发送())).状态, 'sent')
  })
  await 检查('暂缓发送保持待完成，可由本地控制明确结束', async () => {
    const 一 = 创建(); 一.排入场景('manual')
    const 承诺 = 一.发送(发送())
    assert.equal(一.取观测().待完成数, 1)
    一.完成发送('outgoing-001')
    assert.equal((await 承诺).状态, 'sent')
    assert.equal(一.取观测().待完成数, 0)
  })
  await 检查('暂缓任务持有独立快照，不受调用者后续改动影响', async () => {
    const 一 = 创建(), 消息 = 发送(); 一.排入场景('manual')
    const 承诺 = 一.发送(消息)
    消息.接收者编号 = 'other'; 消息.会话.编号 = 'changed'
    assert.equal((await 一.取消(取消())).状态, 'cancelled')
    assert.equal((await 承诺).状态, 'cancelled')
  })
  await 检查('普通取消与重复取消均结束同一暂缓任务', async () => {
    const 一 = 创建(); 一.排入场景('manual')
    const 承诺 = 一.发送(发送())
    const 首次 = await 一.取消(取消()), 再次 = await 一.取消(取消())
    assert.equal(首次.状态, 'cancelled'); assert.deepEqual(再次, 首次)
    assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(一.取观测().模拟送达数, 0)
  })
  await 检查('错误会话和操作者不能取消另一个暂缓任务', async () => {
    const 一 = 创建(); 一.排入场景('manual')
    const 承诺 = 一.发送(发送())
    assert.equal((await 一.取消(取消({ 发送者编号: 'other' }))).错误代码, 'FORBIDDEN')
    assert.equal((await 一.取消(取消({ 会话: { 类型: 'private', 编号: 'other' } }))).错误代码, 'FORBIDDEN')
    assert.equal(一.取观测().待完成数, 1)
    一.完成发送('outgoing-001'); await 承诺
  })
  await 检查('未知请求和其他端点无法取消当前任务', async () => {
    const 一 = 创建(); 一.排入场景('manual')
    const 承诺 = 一.发送(发送())
    assert.equal((await 一.取消(取消({ 请求编号: 'missing' }))).错误代码, 'INVALID_MESSAGE')
    assert.equal((await 一.取消(取消({ 端点: { ...端点, 账号: 'other' } }))).错误代码, 'INVALID_MESSAGE')
    一.完成发送('outgoing-001'); await 承诺
  })
  await 检查('取消能力未知时不伪造取消成功，任务仍可正常结束', async () => {
    const 一 = 创建(); 改能力(一, { 取消: 'unknown' }); 一.排入场景('manual')
    const 承诺 = 一.发送(发送())
    assert.equal((await 一.取消(取消())).错误代码, 'CAPABILITY_UNSUPPORTED')
    一.完成发送('outgoing-001'); assert.equal((await 承诺).状态, 'sent')
  })
  await 检查('已成功或结果未知的任务不能被取消伪装成未送达', async () => {
    const 一 = 创建()
    await 一.发送(发送())
    assert.equal((await 一.取消(取消())).状态, 'sent')
    一.排入场景('unknown'); await 一.发送(发送({ 请求编号: 'unknown-1' }))
    assert.equal((await 一.取消(取消({ 请求编号: 'unknown-1' }))).状态, 'unknown')
  })
  await 检查('预先中止不创建发送任务，中止原因不进入回执', async () => {
    const 一 = 创建(), 控制 = new AbortController()
    控制.abort('SECRET-SENTINEL')
    const 结果 = await 一.发送(发送(), { 中止: 控制.signal })
    assert.equal(结果.状态, 'cancelled')
    assert(!JSON.stringify(结果).includes('SENTINEL'))
    assert.equal(一.取观测().发送尝试数, 0)
  })
  await 检查('中止暂缓任务后清理监听器，后续中止不改变已完成结果', async () => {
    const 一 = 创建(), 控制 = new AbortController(); let 添加 = 0, 移除 = 0
    const 原加 = 控制.signal.addEventListener.bind(控制.signal), 原减 = 控制.signal.removeEventListener.bind(控制.signal)
    控制.signal.addEventListener = (...参数) => { 添加++; return 原加(...参数) }
    控制.signal.removeEventListener = (...参数) => { 移除++; return 原减(...参数) }
    一.排入场景('manual'); const 承诺 = 一.发送(发送(), { 中止: 控制.signal })
    控制.abort(); assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(添加, 1); assert.equal(移除, 1)
    const 后 = new AbortController(); const 成功 = await 一.发送(发送({ 请求编号: 'done' }), { 中止: 后.signal })
    后.abort(); assert.equal(一.完成发送('done').状态, 成功.状态)
  })
  await 检查('离线结束尚未交付的暂缓任务，恢复后需显式重新发送', async () => {
    const 一 = 创建(); 一.排入场景('manual')
    const 承诺 = 一.发送(发送()); 一.设连接(false)
    assert.equal((await 承诺).错误代码, 'CHANNEL_OFFLINE')
    一.设连接(true)
    assert.equal(一.取观测().发送尝试数, 1)
    assert.equal((await 一.发送(发送())).状态, 'sent')
  })
  await 检查('暂缓后能力或截止时间发生变化，完成时再次检查', async () => {
    let 时刻 = '2026-10-25T05:00:10.000Z'
    const 一 = 创建假渠道适配器({ 取现在: () => new Date(时刻) })
    一.排入场景('manual'); const 先 = 一.发送(发送())
    改能力(一, { 回复: 'unsupported' }); 一.完成发送('outgoing-001')
    assert.equal((await 先).错误代码, 'CAPABILITY_UNSUPPORTED')
    改能力(一, { 回复: 'supported' }); 一.排入场景('manual')
    const 后 = 一.发送(发送({ 请求编号: 'later', 截止于: '2026-10-25T05:00:11.000Z' }))
    时刻 = '2026-10-25T05:00:12.000Z'; 一.完成发送('later')
    assert.equal((await 后).错误代码, 'EXPIRED')
  })
  await 检查('同编号不能偷换目标或正文，重排JSON字段不构成不同载荷', async () => {
    const 一 = 创建(), 消息 = 发送(); await 一.发送(消息)
    assert.equal((await 一.发送(发送({ 接收者编号: 'other' }))).错误代码, 'INVALID_MESSAGE')
    assert.equal((await 一.发送(发送({ 正文: 'other' }))).错误代码, 'INVALID_MESSAGE')
    const 重排 = Object.fromEntries(Object.entries(消息).reverse())
    assert.equal((await 一.发送(重排)).状态, 'sent')
    assert.equal(一.取观测().发送尝试数, 2)
  })
  await 检查('同编号并发发送不覆盖原有暂缓任务', async () => {
    const 一 = 创建(); 一.排入场景('manual'); const 先 = 一.发送(发送())
    assert.equal((await 一.发送(发送())).错误代码, 'INVALID_MESSAGE')
    assert.equal(一.取观测().待完成数, 1)
    一.完成发送('outgoing-001'); assert.equal((await 先).状态, 'sent')
  })
  await 检查('private和原始凭据字段在进入任务表或记录前被拒绝', async () => {
    const 一 = 创建()
    await assert.rejects(一.发送(发送({ 可见性: 'private' })), /CHANNEL_CONTRACT_INVALID/)
    await assert.rejects(一.发送(发送({ token: 'SECRET-SENTINEL' })), /CHANNEL_CONTRACT_INVALID/)
    assert.equal(一.取观测().发送尝试数, 0)
    assert.deepEqual(一.取发送记录(), [])
  })
  await 检查('端点不能动态切换，非法能力和控制参数明确失败', () => {
    const 一 = 创建()
    assert.throws(() => 改能力(一, { 端点: { ...端点, 账号: 'other' } }), /FAKE_ENDPOINT_IMMUTABLE/)
    assert.throws(() => 一.排入场景('token=SECRET'), /FAKE_SCENARIO_INVALID/)
    assert.throws(() => 一.设连接('yes'), /FAKE_CONNECTION_INVALID/)
  })
  await 检查('关闭清理订阅和待完成任务，可重复关闭且不允许重开', async () => {
    const 一 = 创建(); 一.订阅接收(() => {}); 一.排入场景('manual')
    const 承诺 = 一.发送(发送()); 一.关闭(); 一.关闭()
    assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(一.取观测().订阅数, 0); assert.equal(一.取观测().待完成数, 0)
    assert.equal((await 一.发送(发送())).错误代码, 'CHANNEL_OFFLINE')
    assert.equal((await 一.注入接收(接收())).错误代码, 'CHANNEL_OFFLINE')
    assert.throws(() => 一.设连接(true), /FAKE_CHANNEL_CLOSED/)
    assert.throws(() => 一.订阅接收(() => {}), /FAKE_CHANNEL_CLOSED/)
  })
  await 检查('重新创建实例不恢复历史任务或登录，只有空白内存状态', async () => {
    const 一 = 创建(); await 一.发送(发送()); 一.关闭()
    const 二 = 创建()
    assert.equal(二.取观测().发送尝试数, 0)
    assert.deepEqual(二.取发送记录(), [])
  })
  console.log(`\n假渠道适配器：${总数}/${总数} 通过（全内存，未接真实账号、模型或服务器）`)
}

// 测试持有短看门狗，避免未解决的Promise在没有活动句柄时让Node提前退出并伪报成功。
const 看门狗 = setTimeout(() => { console.error('FAKE_CHANNEL_TEST_TIMEOUT'); process.exit(1) }, 5000)
main().catch((错误) => { console.error(错误); process.exitCode = 1 }).finally(() => clearTimeout(看门狗))
