/** C-12：只在内存中模拟契约接口。无网络、磁盘、模型、后台计时器或生产接线。 */
'use strict'

const 契约 = require('./渠道契约.cjs')
const 场景们 = new Set(['sent', 'failed', 'unknown', 'manual'])
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))

function 创建假渠道适配器({ 能力, 取现在 = () => new Date() } = {}) {
  let 当前能力 = 契约.校验渠道能力(能力 || {
    版本: 1, 端点: { 渠道: 'fake', 账号: 'local-fixture' },
    回复: 'supported', 主动发送: 'unsupported', 流式: 'unsupported', 取消: 'supported',
    正文上限: 2000, 单次附件上限: 0, 附件类型: [], 回复窗口: { 类型: 'unlimited', 秒数: null },
  })
  if (当前能力.端点.渠道 !== 'fake') throw new TypeError('FAKE_CHANNEL_ONLY')
  if (typeof 取现在 !== 'function') throw new TypeError('FAKE_CLOCK_INVALID')
  const 端点 = 拷贝(当前能力.端点)
  const 订阅们 = new Set()
  const 收件们 = new Map()
  const 任务们 = new Map()
  const 场景队列 = []
  const 发送记录 = []
  let 在线 = true
  let 已关闭 = false
  let 注入次数 = 0
  let 尝试次数 = 0
  let 送达次数 = 0

  function 现在() {
    const 值 = 取现在()
    if (!(值 instanceof Date) || !Number.isFinite(值.getTime())) throw new TypeError('FAKE_CLOCK_INVALID')
    return 值.toISOString()
  }
  现在()
  function 同端点(值) { return 值.渠道 === 端点.渠道 && 值.账号 === 端点.账号 }
  function 同会话(甲, 乙) { return 甲.类型 === 乙.类型 && 甲.编号 === 乙.编号 }
  function 收件键(会话, 消息编号, 发送者编号) { return JSON.stringify([会话.类型, 会话.编号, 消息编号, 发送者编号]) }
  function 载荷键(消息) {
    return JSON.stringify([
      消息.会话.类型, 消息.会话.编号, 消息.接收者编号, 消息.用途, 消息.回复消息编号,
      消息.创建于, 消息.截止于, 消息.可见性, 消息.正文,
      消息.附件.map((一) => [一.编号, 一.类型, 一.名称, 一.媒体类型, 一.字节数]),
    ])
  }
  function 回执(请求编号, 状态, 错误代码 = null, 可重试 = false, 渠道消息编号 = null) {
    return 契约.校验发送结果({
      版本: 1, 端点, 请求编号, 状态, 渠道消息编号, 错误代码, 可重试, 结束于: 现在(),
    })
  }
  function 拒绝(请求编号, 错误代码, 可重试 = false) { return 回执(请求编号, 'failed', 错误代码, 可重试) }
  function 发送前检查(消息) {
    if (!同端点(消息.端点)) return 'INVALID_MESSAGE'
    if (已关闭 || !在线) return 'CHANNEL_OFFLINE'
    if (当前能力[消息.用途 === 'reply' ? '回复' : '主动发送'] !== 'supported') return 'CAPABILITY_UNSUPPORTED'
    if (消息.正文.length > 当前能力.正文上限 || 消息.附件.length > 当前能力.单次附件上限 || 消息.附件.some((一) => !当前能力.附件类型.includes(一.类型))) return 'CAPABILITY_UNSUPPORTED'
    if (消息.截止于 !== null && 消息.截止于 <= 现在()) return 'EXPIRED'
    if (消息.用途 === 'reply' && 当前能力.回复窗口.类型 !== 'unlimited') {
      if (当前能力.回复窗口.类型 === 'unknown') return 'CAPABILITY_UNSUPPORTED'
      const 来源 = 收件们.get(收件键(消息.会话, 消息.回复消息编号, 消息.接收者编号))
      if (!来源 || 来源.发送者编号 !== 消息.接收者编号 || 来源.发生于 === null) return 'INVALID_MESSAGE'
      if (Date.parse(现在()) >= Date.parse(来源.发生于) + 当前能力.回复窗口.秒数 * 1000) return 'EXPIRED'
    }
    return null
  }
  function 结束(任务, 结果) {
    if (任务.结果) return 拷贝(任务.结果)
    任务.结果 = 结果
    if (任务.移除中止) 任务.移除中止()
    // 观测只留契约回执，不留正文、附件、异常或身份映射。
    发送记录.push(拷贝(结果))
    任务.完成(拷贝(结果))
    return 拷贝(结果)
  }
  function 完成(任务, 场景) {
    if (任务.结果) return 拷贝(任务.结果)
    const 错误 = 发送前检查(任务.消息)
    if (错误) return 结束(任务, 拒绝(任务.消息.请求编号, 错误, 错误 === 'CHANNEL_OFFLINE'))
    if (场景 === 'failed') return 结束(任务, 拒绝(任务.消息.请求编号, 'SEND_FAILED', true))
    if (场景 === 'unknown') return 结束(任务, 回执(任务.消息.请求编号, 'unknown', 'DELIVERY_UNKNOWN'))
    送达次数++
    return 结束(任务, 回执(任务.消息.请求编号, 'sent', null, false, 'fake-ack-' + 送达次数))
  }

  function 取能力() { return 拷贝(当前能力) }
  function 订阅接收(处理) {
    if (已关闭) throw new Error('FAKE_CHANNEL_CLOSED')
    if (typeof 处理 !== 'function') throw new TypeError('FAKE_HANDLER_INVALID')
    const 订阅 = { 处理 }
    订阅们.add(订阅)
    let 已取消 = false
    return () => {
      if (!已取消) { 已取消 = true; 订阅们.delete(订阅) }
    }
  }
  async function 注入接收(输入) {
    const 消息 = 契约.校验接收消息(输入)
    if (!同端点(消息.端点)) return { 好: false, 错误代码: 'ENDPOINT_MISMATCH', 通知数: 0, 失败数: 0 }
    if (已关闭 || !在线) return { 好: false, 错误代码: 'CHANNEL_OFFLINE', 通知数: 0, 失败数: 0 }
    注入次数++
    const 键 = 收件键(消息.会话, 消息.消息编号, 消息.发送者编号)
    // 重放仍通知订阅者；旧发生时间不因重放接收时间变化而续期。
    if (!收件们.has(键)) 收件们.set(键, 消息)
    const 处理们 = [...订阅们]
    const 结果 = await Promise.allSettled(处理们.map(({ 处理 }) => Promise.resolve().then(() => 处理(拷贝(消息)))))
    const 失败数 = 结果.filter((一) => 一.status === 'rejected').length
    return { 好: 失败数 === 0, 错误代码: 失败数 ? 'RECEIVER_FAILED' : null, 通知数: 结果.length, 失败数 }
  }
  async function 发送(输入, { 中止 } = {}) {
    const 消息 = 契约.校验发送消息(输入)
    if (中止 !== undefined && !(中止 instanceof AbortSignal)) throw new TypeError('FAKE_SIGNAL_INVALID')
    const 错误 = 发送前检查(消息)
    if (错误) return 拒绝(消息.请求编号, 错误, 错误 === 'CHANNEL_OFFLINE')
    if (中止 && 中止.aborted) return 回执(消息.请求编号, 'cancelled', 'CANCELLED')
    const 旧任务 = 任务们.get(消息.请求编号)
    if (旧任务) {
      if (载荷键(旧任务.消息) !== 载荷键(消息)) return 拒绝(消息.请求编号, 'INVALID_MESSAGE')
      if (!旧任务.结果) return 拒绝(消息.请求编号, 'INVALID_MESSAGE')
    }
    尝试次数++
    const 场景 = 场景队列.shift() || 'sent'
    const 任务 = { 消息, 完成: null, 结果: null, 移除中止: null }
    const 承诺 = new Promise((完成承诺) => { 任务.完成 = 完成承诺 })
    任务们.set(消息.请求编号, 任务)
    if (中止) {
      const 中止处理 = () => 结束(任务, 回执(消息.请求编号, 'cancelled', 'CANCELLED'))
      中止.addEventListener('abort', 中止处理, { once: true })
      任务.移除中止 = () => 中止.removeEventListener('abort', 中止处理)
    }
    if (场景 !== 'manual') 完成(任务, 场景)
    return 承诺
  }
  async function 取消(输入) {
    const 请求 = 契约.校验取消请求(输入)
    if (!同端点(请求.端点)) return 拒绝(请求.请求编号, 'INVALID_MESSAGE')
    const 任务 = 任务们.get(请求.请求编号)
    if (!任务) return 拒绝(请求.请求编号, 'INVALID_MESSAGE')
    if (!同会话(请求.会话, 任务.消息.会话) || 请求.发送者编号 !== 任务.消息.接收者编号) return 拒绝(请求.请求编号, 'FORBIDDEN')
    if (任务.结果) return 拷贝(任务.结果)
    if (当前能力.取消 !== 'supported') return 拒绝(请求.请求编号, 'CAPABILITY_UNSUPPORTED')
    return 结束(任务, 回执(请求.请求编号, 'cancelled', 'CANCELLED'))
  }
  function 排入场景(场景) {
    if (已关闭) throw new Error('FAKE_CHANNEL_CLOSED')
    if (!场景们.has(场景)) throw new TypeError('FAKE_SCENARIO_INVALID')
    场景队列.push(场景)
  }
  function 完成发送(请求编号, 场景 = 'sent') {
    if (!场景们.has(场景) || 场景 === 'manual') throw new TypeError('FAKE_SCENARIO_INVALID')
    const 任务 = 任务们.get(请求编号)
    if (!任务) return null
    return 完成(任务, 场景)
  }
  function 设连接(值) {
    if (typeof 值 !== 'boolean') throw new TypeError('FAKE_CONNECTION_INVALID')
    if (已关闭) throw new Error('FAKE_CHANNEL_CLOSED')
    在线 = 值
    if (!在线) for (const 任务 of 任务们.values()) if (!任务.结果) 结束(任务, 拒绝(任务.消息.请求编号, 'CHANNEL_OFFLINE', true))
  }
  function 设能力(输入) {
    const 新能力 = 契约.校验渠道能力(输入)
    if (!同端点(新能力.端点)) throw new TypeError('FAKE_ENDPOINT_IMMUTABLE')
    if (已关闭) throw new Error('FAKE_CHANNEL_CLOSED')
    当前能力 = 新能力
  }
  function 取观测() {
    return { 实例类型: 'fake-local-only', 在线: 在线 && !已关闭, 已关闭, 订阅数: 订阅们.size, 接收注入次数: 注入次数, 发送尝试数: 尝试次数, 模拟送达数: 送达次数, 待完成数: [...任务们.values()].filter((一) => !一.结果).length }
  }
  function 取发送记录() { return 拷贝(发送记录) }
  function 关闭() {
    if (已关闭) return
    已关闭 = true
    在线 = false
    订阅们.clear()
    场景队列.length = 0
    for (const 任务 of 任务们.values()) if (!任务.结果) 结束(任务, 回执(任务.消息.请求编号, 'cancelled', 'CANCELLED'))
    任务们.clear()
    收件们.clear()
  }

  return Object.freeze({ 取能力, 订阅接收, 发送, 取消, 注入接收, 排入场景, 完成发送, 设连接, 设能力, 取观测, 取发送记录, 关闭 })
}

module.exports = { 创建假渠道适配器 }
