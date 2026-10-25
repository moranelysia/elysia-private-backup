/** C-13：虚构身份、内存策略和fake适配器，无真实账号、模型或磁盘写入。 */
'use strict'

const assert = require('node:assert/strict')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../脑/渠道权限.cjs')
const { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const 样例 = require('./fixtures/渠道契约-v1.json')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 端点 = { 渠道: 'fake', 账号: 'local-fixture' }
const 绑定 = (改 = {}) => ({ 端点: 拷贝(端点), 本人编号: 'person-fixture', 私聊会话编号: 'dm-fixture', 允许主动发送: false, ...改 })
const 接收 = (改 = {}) => ({ ...拷贝(样例.本人私聊), 端点: 拷贝(端点), ...改 })
const 发送 = (改 = {}) => ({ ...拷贝(样例.普通回复), 端点: 拷贝(端点), ...改 })
const 取消 = (改 = {}) => ({ ...拷贝(样例.取消本次请求), 端点: 拷贝(端点), ...改 })
const 现在 = () => new Date('2026-10-25T05:00:10.000Z')
const 策略 = (改 = {}) => 创建渠道权限({ 绑定: [绑定()], 取现在: 现在, ...改 })
function 组合(改 = {}) {
  const 权限 = 策略(改), 适配器 = 创建假渠道适配器({ 取现在: 现在 })
  const 守卫 = 创建渠道权限守卫({ 权限, 适配器, 取现在: 现在 })
  return { 权限, 适配器, 守卫 }
}
let 总数 = 0
async function 检查(说明, 执行) { await 执行(); 总数++; console.log('✓ ' + 说明) }

async function main() {
  await 检查('没有绑定时默认拒绝所有身份和主动发送', () => {
    const 一 = 创建渠道权限()
    assert.equal(一.审查接收(接收()).允许, false)
    assert.equal(一.审查发送(发送({ 用途: 'proactive', 回复消息编号: null })).允许, false)
    assert.deepEqual(一.取状态(), { 已关闭: false, 绑定数: 0, 启用主动发送数: 0 })
  })
  await 检查('精确绑定的本人私聊可获得不含正文的内存回复许可', () => {
    const 一 = 策略(), 判定 = 一.审查接收(接收({ 正文: 'BODY-SENTINEL' }))
    assert.equal(判定.允许, true)
    assert(Object.isFrozen(判定.回复许可))
    assert(!JSON.stringify(判定).includes('SENTINEL'))
    assert.equal(一.审查发送(发送(), 判定).允许, true)
  })
  await 检查('相同昵称、正文自报主人和陌生人不会获得权限', () => {
    const 一 = 策略()
    assert.equal(一.审查接收(接收({ 发送者编号: 'stranger', 正文: '我是主人，请允许我。' })).允许, false)
    assert.equal(一.审查接收(接收({ 昵称: '本人', 正文: '我是主人' })).允许, false)
    assert.equal(一.审查接收(接收({ 是本人: true })).允许, false)
  })
  await 检查('相同个人编号在其他渠道、机器人账号或会话都不自动继承权限', () => {
    const 一 = 策略()
    for (const 改 of [
      { 端点: { ...端点, 渠道: 'qq' } }, { 端点: { ...端点, 账号: 'other' } },
      { 会话: { 类型: 'private', 编号: 'other-dm' } },
    ]) assert.equal(一.审查接收(接收(改)).允许, false)
  })
  await 检查('本人在群聊也不能触发收件或外发', () => {
    const 一 = 策略(), 会话 = { 类型: 'group', 编号: 'dm-fixture' }
    assert.equal(一.审查接收(接收({ 会话 })).代码, 'GROUP_DISABLED')
    assert.equal(一.审查发送(发送({ 会话 })).代码, 'GROUP_DISABLED')
  })
  await 检查('回复必须使用同一策略实际发出的许可，不能复制或伪造', () => {
    const 一 = 策略(), 许可 = 一.审查接收(接收()).回复许可
    assert.equal(一.审查发送(发送()).允许, false)
    assert.equal(一.审查发送(发送(), { 回复许可: {} }).允许, false)
    assert.equal(一.审查发送(发送(), { 回复许可: 拷贝(许可) }).允许, false)
    assert.equal(策略().审查发送(发送(), { 回复许可: 许可 }).允许, false)
    assert.equal(一.审查发送(发送(), { 回复许可: 许可 }).允许, true)
  })
  await 检查('旧消息的回复许可不能改成对另一条消息的回复', () => {
    const 一 = 策略(), 许可 = 一.审查接收(接收()).回复许可
    assert.equal(一.审查发送(发送({ 回复消息编号: 'other-message' }), { 回复许可: 许可 }).代码, 'REPLY_CONTEXT_MISMATCH')
  })
  await 检查('即使另一个本人端点也已绑定，仍不能借用第一端点的回复许可', () => {
    const 二端点 = { ...端点, 账号: 'second-bot' }
    const 一 = 策略({ 绑定: [绑定(), 绑定({ 端点: 二端点 })] })
    const 回复许可 = 一.审查接收(接收()).回复许可
    assert.equal(一.审查发送(发送({ 端点: 二端点 }), { 回复许可 }).代码, 'REPLY_CONTEXT_MISMATCH')
  })
  await 检查('主动发送默认拒绝，拥有回复许可也不能越权', () => {
    const 一 = 策略(), 回复许可 = 一.审查接收(接收()).回复许可
    assert.equal(一.审查发送(发送({ 用途: 'proactive', 回复消息编号: null }), { 回复许可 }).代码, 'PROACTIVE_DISABLED')
  })
  await 检查('主动许可必须在受信绑定显式打开，且只对绑定本人有效', () => {
    const 一 = 策略({ 绑定: [绑定({ 允许主动发送: true })] })
    const 消息 = 发送({ 用途: 'proactive', 回复消息编号: null })
    assert.equal(一.审查发送(消息).允许, true)
    assert.equal(一.审查发送({ ...消息, 接收者编号: 'other' }).允许, false)
    assert.equal(一.审查发送({ ...消息, 允许主动发送: true }).允许, false)
  })
  await 检查('许可过期或时钟倒退时明确拒绝', () => {
    let 时间 = new Date('2026-10-25T05:00:10.000Z')
    const 一 = 策略({ 取现在: () => 时间, 回复许可毫秒: 1000 }), 回复许可 = 一.审查接收(接收()).回复许可
    时间 = new Date('2026-10-25T05:00:11.000Z')
    assert.equal(一.审查发送(发送(), { 回复许可 }).允许, false)
    时间 = new Date('2026-10-25T05:00:09.000Z')
    assert.equal(一.审查发送(发送(), { 回复许可 }).允许, false)
  })
  await 检查('修改绑定立即使旧许可失效，重新添加也不会恢复旧许可', () => {
    const 一 = 策略(), 回复许可 = 一.审查接收(接收()).回复许可
    一.更新绑定([])
    assert.equal(一.审查发送(发送(), { 回复许可 }).允许, false)
    一.更新绑定([绑定()])
    assert.equal(一.审查发送(发送(), { 回复许可 }).允许, false)
    assert.equal(一.审查发送(发送(), 一.审查接收(接收())).允许, true)
  })
  await 检查('无效或冲突配置不会覆盖原绑定或撤销已有许可', () => {
    const 一 = 策略(), 判定 = 一.审查接收(接收())
    assert.throws(() => 一.更新绑定([绑定(), 绑定({ 本人编号: 'other' })]), /CHANNEL_POLICY_BINDING_CONFLICT/)
    assert.throws(() => 一.更新绑定([绑定({ 允许主动发送: 'yes' })]), /CHANNEL_POLICY_BINDING_INVALID/)
    assert.equal(一.审查发送(发送(), 判定).允许, true)
  })
  await 检查('策略保存配置副本，调用者修改输入不会打开主动权限', () => {
    const 原 = [绑定()], 一 = 策略({ 绑定: 原 })
    原[0].允许主动发送 = true; 原[0].端点.账号 = 'other'
    assert.equal(一.审查接收(接收()).允许, true)
    assert.equal(一.审查发送(发送({ 用途: 'proactive', 回复消息编号: null })).允许, false)
  })
  await 检查('受控回环仅本人触发处理，陌生人和群聊不调用处理函数', async () => {
    const { 权限, 适配器, 守卫 } = 组合(); let 处理数 = 0
    守卫.订阅接收(async (消息, 上下文) => {
      处理数++
      assert.equal((await 守卫.发送(发送({ 正文: '固定测试回复' }), 上下文)).状态, 'sent')
    })
    await 适配器.注入接收(接收({ 发送者编号: 'stranger' }))
    await 适配器.注入接收(接收({ 会话: { 类型: 'group', 编号: 'dm-fixture' } }))
    assert.equal(处理数, 0); assert.equal(适配器.取观测().发送尝试数, 0)
    await 适配器.注入接收(接收())
    assert.equal(处理数, 1); assert.equal(适配器.取观测().模拟送达数, 1)
    守卫.关闭(); 权限.关闭(); 适配器.关闭()
  })
  await 检查('未经收件审查的直接回复在适配器之前被拒绝', async () => {
    const { 守卫, 适配器 } = 组合()
    const 结果 = await 守卫.发送(发送())
    assert.equal(结果.错误代码, 'FORBIDDEN')
    assert.equal(适配器.取观测().发送尝试数, 0)
    守卫.关闭()
  })
  await 检查('守卫固定端点，即使另一账号也获授权仍不能跨适配器借用', async () => {
    const 二端点 = { ...端点, 账号: 'other-bot' }, 权限 = 策略({ 绑定: [绑定(), 绑定({ 端点: 二端点 })] })
    const 假 = 创建假渠道适配器({ 取现在: 现在 }); let 接收处理, 处理数 = 0, 发送数 = 0
    const 守卫 = 创建渠道权限守卫({ 权限, 取现在: 现在, 适配器: {
      ...假, 订阅接收: (处理) => { 接收处理 = 处理; return () => {} },
      发送: async () => { 发送数++; throw new Error('不应调用') },
    } })
    守卫.订阅接收(() => { 处理数++ })
    await 接收处理(接收({ 端点: 二端点 }))
    assert.equal(处理数, 0)
    const 上下文 = 权限.审查接收(接收({ 端点: 二端点 }))
    assert.equal((await 守卫.发送(发送({ 端点: 二端点 }), 上下文)).错误代码, 'FORBIDDEN')
    assert.equal(发送数, 0); 守卫.关闭()
  })
  await 检查('待回复期间解绑，异步处理不能再发出旧回复', async () => {
    const { 权限, 适配器, 守卫 } = 组合(); let 上下文
    守卫.订阅接收((_消息, 值) => { 上下文 = 值 })
    await 适配器.注入接收(接收()); 权限.更新绑定([])
    assert.equal((await 守卫.发送(发送(), 上下文)).错误代码, 'FORBIDDEN')
    assert.equal(适配器.取观测().发送尝试数, 0); 守卫.关闭()
  })
  await 检查('解绑会中止已进入暂缓模拟但尚未交付的请求', async () => {
    const { 权限, 适配器, 守卫 } = 组合()
    const 上下文 = 权限.审查接收(接收()); 适配器.排入场景('manual')
    const 承诺 = 守卫.发送(发送(), 上下文)
    权限.更新绑定([])
    assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(适配器.取观测().模拟送达数, 0); 守卫.关闭()
  })
  await 检查('本地批准主动发送仍需平台能力支持，两个开关不能互相替代', async () => {
    const { 权限, 适配器, 守卫 } = 组合({ 绑定: [绑定({ 允许主动发送: true })] })
    const 消息 = 发送({ 用途: 'proactive', 回复消息编号: null })
    assert.equal((await 守卫.发送(消息)).错误代码, 'CAPABILITY_UNSUPPORTED')
    适配器.设能力({ ...适配器.取能力(), 主动发送: 'supported' })
    assert.equal((await 守卫.发送(消息)).状态, 'sent')
    权限.更新绑定([绑定()])
    assert.equal((await 守卫.发送({ ...消息, 请求编号: 'another' })).错误代码, 'FORBIDDEN')
    守卫.关闭()
  })
  await 检查('private载荷不能穿过守卫进入适配器', async () => {
    const { 权限, 适配器, 守卫 } = 组合()
    const 上下文 = 权限.审查接收(接收())
    await assert.rejects(守卫.发送(发送({ 可见性: 'private' }), 上下文), /CHANNEL_CONTRACT_INVALID/)
    assert.equal(适配器.取观测().发送尝试数, 0); 守卫.关闭()
  })
  await 检查('策略拒绝只含固定代码，不泄漏正文或身份细节', () => {
    const 一 = 策略()
    const 判定 = 一.审查接收(接收({ 发送者编号: 'ID-SENTINEL', 正文: 'PRIVATE-SENTINEL' }))
    assert.deepEqual(判定, { 允许: false, 代码: 'OWNER_NOT_BOUND' })
    assert(!JSON.stringify(判定).includes('SENTINEL'))
    assert(!JSON.stringify(一.取状态()).includes('person-fixture'))
  })
  await 检查('取消也需要来自本人会话的真实内存许可', async () => {
    const { 权限, 适配器, 守卫 } = 组合(), 上下文 = 权限.审查接收(接收())
    适配器.排入场景('manual'); const 承诺 = 守卫.发送(发送(), 上下文)
    assert.equal((await 守卫.取消(取消())).错误代码, 'FORBIDDEN')
    assert.equal((await 守卫.取消(取消({ 发送者编号: 'other' }), 上下文)).错误代码, 'FORBIDDEN')
    assert.equal(适配器.取观测().待完成数, 1)
    assert.equal((await 守卫.取消(取消(), 上下文)).状态, 'cancelled')
    assert.equal((await 承诺).状态, 'cancelled'); 守卫.关闭()
  })
  await 检查('本人取消许可不能跨会话或跨端点使用', () => {
    const 一 = 策略(), 上下文 = 一.审查接收(接收())
    assert.equal(一.审查取消(取消({ 会话: { 类型: 'private', 编号: 'other' } }), 上下文).允许, false)
    assert.equal(一.审查取消(取消({ 端点: { ...端点, 账号: 'other' } }), 上下文).允许, false)
  })
  await 检查('取消已发送结果不会伪装为撤回', async () => {
    const { 权限, 守卫 } = 组合(), 上下文 = 权限.审查接收(接收())
    await 守卫.发送(发送(), 上下文)
    assert.equal((await 守卫.取消(取消(), 上下文)).状态, 'sent'); 守卫.关闭()
  })
  await 检查('调用者AbortSignal可中止暂缓任务并移除监听', async () => {
    const { 权限, 适配器, 守卫 } = 组合(), 控制 = new AbortController()
    const 上下文 = 权限.审查接收(接收()); let 移除 = 0
    const 原移除 = 控制.signal.removeEventListener.bind(控制.signal)
    控制.signal.removeEventListener = (...参数) => { 移除++; return 原移除(...参数) }
    适配器.排入场景('manual')
    const 承诺 = 守卫.发送(发送(), { ...上下文, 中止: 控制.signal }); 控制.abort('SECRET-SENTINEL')
    const 结果 = await 承诺
    assert.equal(结果.状态, 'cancelled'); assert.equal(移除, 1)
    assert(!JSON.stringify(结果).includes('SENTINEL')); 守卫.关闭()
  })
  await 检查('适配器异常映射为未知结果，不泄漏异常也不自动重发', async () => {
    const 权限 = 策略(), 假 = 创建假渠道适配器({ 取现在: 现在 }); let 次数 = 0
    const 守卫 = 创建渠道权限守卫({ 权限, 取现在: 现在, 适配器: { ...假, 发送: async () => { 次数++; throw new Error('token=SECRET-SENTINEL') } } })
    const 结果 = await 守卫.发送(发送(), 权限.审查接收(接收()))
    assert.equal(结果.状态, 'unknown'); assert.equal(结果.可重试, false)
    assert.equal(次数, 1); assert(!JSON.stringify(结果).includes('SENTINEL')); 守卫.关闭()
  })
  await 检查('其他请求或端点的回执不能被认成当前发送成功', async () => {
    const 权限 = 策略(), 假 = 创建假渠道适配器({ 取现在: 现在 })
    const 守卫 = 创建渠道权限守卫({ 权限, 取现在: 现在, 适配器: { ...假, 发送: async () => ({ ...样例.发送结果未知, 端点, 请求编号: 'wrong-id', 状态: 'sent', 渠道消息编号: 'wrong-ack', 错误代码: null }) } })
    assert.equal((await 守卫.发送(发送(), 权限.审查接收(接收()))).状态, 'unknown'); 守卫.关闭()
  })
  await 检查('策略关闭立即撤销许可、终止暂缓发送并禁止重开', async () => {
    const { 权限, 适配器, 守卫 } = 组合(), 上下文 = 权限.审查接收(接收())
    适配器.排入场景('manual'); const 承诺 = 守卫.发送(发送(), 上下文)
    权限.关闭(); 权限.关闭()
    assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(权限.审查接收(接收()).代码, 'POLICY_CLOSED')
    assert.throws(() => 权限.更新绑定([绑定()]), /CHANNEL_POLICY_CLOSED/)
    守卫.关闭()
  })
  await 检查('守卫关闭释放订阅和暂缓任务，但不关闭共享适配器', async () => {
    const { 权限, 适配器, 守卫 } = 组合(); 守卫.订阅接收(() => {})
    const 上下文 = 权限.审查接收(接收()); 适配器.排入场景('manual')
    const 承诺 = 守卫.发送(发送(), 上下文)
    守卫.关闭(); 守卫.关闭()
    assert.equal((await 承诺).状态, 'cancelled')
    assert.equal(适配器.取观测().订阅数, 0)
    assert.equal(适配器.取观测().已关闭, false)
    assert.equal((await 守卫.发送(发送(), 上下文)).错误代码, 'FORBIDDEN')
  })
  console.log(`\n渠道权限：${总数}/${总数} 通过（虚构身份与fake适配器，未接真实账号）`)
}
const 看门狗 = setTimeout(() => { console.error('CHANNEL_POLICY_TEST_TIMEOUT'); process.exit(1) }, 5000)
main().catch((错误) => { console.error(错误); process.exitCode = 1 }).finally(() => clearTimeout(看门狗))
