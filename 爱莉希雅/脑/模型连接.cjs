/** 桌面与独立核心共用的受信连接；不查找文件/环境凭据，不提供默认网络请求。 */
'use strict'
const 连接们 = new WeakSet()
function 失败(码) { throw new Error(码) }
function 创建严格凭据({ 读取 } = {}) {
  if (typeof 读取 !== 'function') 失败('CORE_CREDENTIAL_PROVIDER_REQUIRED')
  return Object.freeze({ 取() {
    let 值
    try { 值 = 读取() } catch { 失败('CORE_CREDENTIAL_UNAVAILABLE') }
    if (typeof 值 !== 'string' || 值.trim().length < 20 || 值.length > 4096 || /[\u0000-\u0020\u007f]/u.test(值)) 失败('CORE_CREDENTIAL_UNAVAILABLE')
    return 值
  } })
}
function 创建假模型连接({ 生成 } = {}) {
  if (typeof 生成 !== 'function') 失败('CORE_MODEL_REQUIRED')
  // 假模型没有凭据接口；回调只取得消息副本与中止信号。
  const 连接 = Object.freeze({ 模式: 'fake', async 要一轮({ 消息们, 中止 }) {
    if (中止?.aborted) 失败('CORE_ABORTED')
    let 文本
    try { 文本 = await 生成(structuredClone(消息们), Object.freeze({ 中止 })) }
    catch { 失败(中止?.aborted ? 'CORE_ABORTED' : 'CORE_MODEL_FAILED') }
    if (中止?.aborted) 失败('CORE_ABORTED')
    if (typeof 文本 !== 'string' || !文本.trim() || 文本.length > 8000) 失败('CORE_MODEL_INVALID')
    return { 全文: 文本, 用了: null, 想过: '', 结束原因: 'stop' }
  } })
  连接们.add(连接); return 连接
}
function 是假模型连接(值) { return !!值 && 连接们.has(值) }
module.exports = { 创建严格凭据, 创建假模型连接, 是假模型连接 }
