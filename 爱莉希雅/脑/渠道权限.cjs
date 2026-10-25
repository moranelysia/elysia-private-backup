/** C-13：受信本机配置绑定本人；所有状态仅在内存，不做平台认证、会话映射或持久队列。 */
'use strict'

const 契约 = require('./渠道契约.cjs')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 拒绝 = (代码) => ({ 允许: false, 代码 })
const 允许 = (代码) => ({ 允许: true, 代码 })

function 创建渠道权限({ 绑定 = [], 回复许可毫秒 = 600000, 取现在 = () => new Date() } = {}) {
  if (!Number.isSafeInteger(回复许可毫秒) || 回复许可毫秒 < 1 || 回复许可毫秒 > 86400000) throw new TypeError('CHANNEL_POLICY_TTL_INVALID')
  function 时刻() {
    const 值 = 取现在()
    if (!(值 instanceof Date) || !Number.isFinite(值.getTime())) throw new TypeError('CHANNEL_POLICY_CLOCK_INVALID')
    return 值.getTime()
  }
  时刻()
  let 已关闭 = false
  let 本人们 = new Map()
  let 许可们 = new WeakMap()
  const 监听们 = new Set()
  function 定位(端点, 会话, 本人编号) { return 契约.会话定位键({ 端点, 会话, 发送者编号: 本人编号 }) }
  function 规整绑定(列表) {
    if (!Array.isArray(列表) || 列表.length > 64) throw new TypeError('CHANNEL_POLICY_BINDING_INVALID')
    const 表 = new Map(), 会话们 = new Set()
    for (const 一 of 列表) {
      if (!一 || Object.getPrototypeOf(一) !== Object.prototype || Reflect.ownKeys(一).length !== 4 ||
          !['端点', '本人编号', '私聊会话编号', '允许主动发送'].every((键) => Object.hasOwn(一, 键) && Object.hasOwn(Object.getOwnPropertyDescriptor(一, 键), 'value')) ||
          typeof 一.允许主动发送 !== 'boolean') throw new TypeError('CHANNEL_POLICY_BINDING_INVALID')
      const 会话 = { 类型: 'private', 编号: 一.私聊会话编号 }
      let 键
      try { 键 = 定位(一.端点, 会话, 一.本人编号) } catch { throw new TypeError('CHANNEL_POLICY_BINDING_INVALID') }
      const 会话键 = JSON.stringify([一.端点.渠道, 一.端点.账号, 一.私聊会话编号])
      if (会话们.has(会话键)) throw new TypeError('CHANNEL_POLICY_BINDING_CONFLICT')
      会话们.add(会话键)
      表.set(键, 拷贝(一))
    }
    return 表
  }
  function 通知变更() { for (const 处理 of [...监听们]) { try { 处理() } catch { /* 不传播监听者的原始异常 */ } } }
  function 更新绑定(列表) {
    if (已关闭) throw new Error('CHANNEL_POLICY_CLOSED')
    const 新表 = 规整绑定(列表)
    本人们 = 新表
    许可们 = new WeakMap()
    通知变更()
  }
  更新绑定(绑定)
  function 订阅变更(处理) {
    if (已关闭) throw new Error('CHANNEL_POLICY_CLOSED')
    if (typeof 处理 !== 'function') throw new TypeError('CHANNEL_POLICY_LISTENER_INVALID')
    监听们.add(处理)
    return () => 监听们.delete(处理)
  }
  function 查本人(端点, 会话, 编号) { return 本人们.get(定位(端点, 会话, 编号)) }
  function 查许可(令牌) {
    const 一 = 许可们.get(令牌)
    return 一 && 时刻() >= 一.创建于 && 时刻() < 一.失效于 ? 一 : null
  }
  function 审查接收(输入) {
    if (已关闭) return 拒绝('POLICY_CLOSED')
    let 消息
    try { 消息 = 契约.校验接收消息(输入) } catch { return 拒绝('INVALID_CONTRACT') }
    if (消息.会话.类型 !== 'private') return 拒绝('GROUP_DISABLED')
    if (!查本人(消息.端点, 消息.会话, 消息.发送者编号)) return 拒绝('OWNER_NOT_BOUND')
    const 回复许可 = Object.freeze({})
    const 创建于 = 时刻()
    许可们.set(回复许可, {
      端点: 消息.端点, 会话: 消息.会话, 本人编号: 消息.发送者编号, 消息编号: 消息.消息编号,
      创建于, 失效于: 创建于 + 回复许可毫秒,
    })
    return { ...允许('OWNER_PRIVATE'), 回复许可 }
  }
  function 审查发送(输入, { 回复许可 } = {}) {
    if (已关闭) return 拒绝('POLICY_CLOSED')
    let 消息
    try { 消息 = 契约.校验发送消息(输入) } catch { return 拒绝('INVALID_CONTRACT') }
    if (消息.会话.类型 !== 'private') return 拒绝('GROUP_DISABLED')
    const 本人 = 查本人(消息.端点, 消息.会话, 消息.接收者编号)
    if (!本人) return 拒绝('OWNER_NOT_BOUND')
    if (消息.用途 === 'proactive') return 本人.允许主动发送 ? 允许('OWNER_PROACTIVE') : 拒绝('PROACTIVE_DISABLED')
    const 来源 = 查许可(回复许可)
    if (!来源) return 拒绝('REPLY_CONTEXT_INVALID')
    if (定位(来源.端点, 来源.会话, 来源.本人编号) !== 定位(消息.端点, 消息.会话, 消息.接收者编号) || 来源.消息编号 !== 消息.回复消息编号) return 拒绝('REPLY_CONTEXT_MISMATCH')
    return 允许('OWNER_REPLY')
  }
  function 审查取消(输入, { 回复许可 } = {}) {
    if (已关闭) return 拒绝('POLICY_CLOSED')
    let 请求
    try { 请求 = 契约.校验取消请求(输入) } catch { return 拒绝('INVALID_CONTRACT') }
    if (请求.会话.类型 !== 'private') return 拒绝('GROUP_DISABLED')
    if (!查本人(请求.端点, 请求.会话, 请求.发送者编号)) return 拒绝('OWNER_NOT_BOUND')
    const 来源 = 查许可(回复许可)
    if (!来源 || 定位(来源.端点, 来源.会话, 来源.本人编号) !== 定位(请求.端点, 请求.会话, 请求.发送者编号)) return 拒绝('REPLY_CONTEXT_INVALID')
    return 允许('OWNER_CANCEL')
  }
  function 取状态() { return { 已关闭, 绑定数: 本人们.size, 启用主动发送数: [...本人们.values()].filter((一) => 一.允许主动发送).length } }
  function 关闭() {
    if (已关闭) return
    已关闭 = true
    本人们.clear()
    许可们 = new WeakMap()
    通知变更()
    监听们.clear()
  }
  return Object.freeze({ 审查接收, 审查发送, 审查取消, 更新绑定, 订阅变更, 取状态, 关闭 })
}

/** 守卫只组合策略与已有适配器；输入身份须由受信适配器验证，禁止把它作为匿名网络API。 */
function 创建渠道权限守卫({ 适配器, 权限, 取现在 = () => new Date() }) {
  for (const 名 of ['取能力', '订阅接收', '发送', '取消']) if (!适配器 || typeof 适配器[名] !== 'function') throw new TypeError('CHANNEL_GUARD_ADAPTER_INVALID')
  for (const 名 of ['审查接收', '审查发送', '审查取消', '订阅变更']) if (!权限 || typeof 权限[名] !== 'function') throw new TypeError('CHANNEL_GUARD_POLICY_INVALID')
  const 端点 = 契约.校验渠道能力(适配器.取能力()).端点
  const 同端点 = (值) => 值.渠道 === 端点.渠道 && 值.账号 === 端点.账号
  const 活动们 = new Set(), 订阅们 = new Set()
  let 已关闭 = false
  function 回执(消息, 状态, 错误代码) {
    return 契约.校验发送结果({ 版本: 1, 端点: 消息.端点, 请求编号: 消息.请求编号, 状态, 渠道消息编号: null, 错误代码, 可重试: false, 结束于: 取现在().toISOString() })
  }
  function 核对回执(原, 消息) {
    const 一 = 契约.校验发送结果(原)
    if (一.请求编号 !== 消息.请求编号 || 一.端点.渠道 !== 消息.端点.渠道 || 一.端点.账号 !== 消息.端点.账号) throw new Error('CHANNEL_RECEIPT_MISMATCH')
    return 一
  }
  function 中止全部() { for (const 控制 of 活动们) 控制.abort() }
  const 取消变更订阅 = 权限.订阅变更(中止全部)
  function 订阅接收(处理) {
    if (已关闭) throw new Error('CHANNEL_GUARD_CLOSED')
    if (typeof 处理 !== 'function') throw new TypeError('CHANNEL_GUARD_HANDLER_INVALID')
    const 停止 = 适配器.订阅接收(async (原) => {
      if (已关闭) return
      const 消息 = 契约.校验接收消息(原)
      if (!同端点(消息.端点)) return
      const 判定 = 权限.审查接收(消息)
      if (判定.允许) await 处理(消息, { 回复许可: 判定.回复许可 })
    })
    let 已取消 = false
    const 退出 = () => { if (!已取消) { 已取消 = true; 订阅们.delete(退出); 停止() } }
    订阅们.add(退出)
    return 退出
  }
  async function 发送(输入, { 回复许可, 中止 } = {}) {
    const 消息 = 契约.校验发送消息(输入)
    if (中止 !== undefined && !(中止 instanceof AbortSignal)) throw new TypeError('CHANNEL_GUARD_SIGNAL_INVALID')
    if (已关闭 || !同端点(消息.端点) || !权限.审查发送(消息, { 回复许可 }).允许) return 回执(消息, 'failed', 'FORBIDDEN')
    const 控制 = new AbortController()
    const 中止处理 = () => 控制.abort()
    if (中止) { 中止.addEventListener('abort', 中止处理, { once: true }); if (中止.aborted) 控制.abort() }
    活动们.add(控制)
    try { return 核对回执(await 适配器.发送(消息, { 中止: 控制.signal }), 消息) }
    catch { return 回执(消息, 'unknown', 'DELIVERY_UNKNOWN') }
    finally { 活动们.delete(控制); if (中止) 中止.removeEventListener('abort', 中止处理) }
  }
  async function 取消(输入, { 回复许可 } = {}) {
    const 请求 = 契约.校验取消请求(输入)
    if (已关闭 || !同端点(请求.端点) || !权限.审查取消(请求, { 回复许可 }).允许) return 回执(请求, 'failed', 'FORBIDDEN')
    try { return 核对回执(await 适配器.取消(请求), 请求) }
    catch { return 回执(请求, 'unknown', 'DELIVERY_UNKNOWN') }
  }
  function 关闭() {
    if (已关闭) return
    已关闭 = true
    取消变更订阅()
    中止全部()
    for (const 停止 of [...订阅们]) 停止()
  }
  function 取能力() {
    const 值 = 契约.校验渠道能力(适配器.取能力())
    if (!同端点(值.端点)) throw new Error('CHANNEL_GUARD_ENDPOINT_CHANGED')
    return 值
  }
  return Object.freeze({ 取能力, 订阅接收, 发送, 取消, 关闭 })
}

module.exports = { 创建渠道权限, 创建渠道权限守卫 }
