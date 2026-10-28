/** 桌面与独立核心共用的受信连接；不查找文件/环境凭据，不提供默认网络请求。 */
'use strict'
const 连接们 = new WeakSet()
const 真实连接们 = new WeakSet(), 凭据们 = new WeakSet()
const { randomUUID } = require('node:crypto')
const { 等待有界 } = require('./任务控制.cjs')
function 失败(码) { throw new Error(码) }
function 创建严格凭据({ 读取 } = {}) {
  if (typeof 读取 !== 'function') 失败('CORE_CREDENTIAL_PROVIDER_REQUIRED')
  const 凭据 = Object.freeze({ 取() {
    let 值
    try { 值 = 读取() } catch { 失败('CORE_CREDENTIAL_UNAVAILABLE') }
    if (typeof 值 !== 'string' || 值.trim().length < 20 || 值.length > 4096 || /[\u0000-\u0020\u007f]/u.test(值)) 失败('CORE_CREDENTIAL_UNAVAILABLE')
    return 值
  } }); 凭据们.add(凭据); return 凭据
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
function 是真实模型连接(值) { return !!值 && 真实连接们.has(值) }
function 创建真实模型连接({ 凭据, 模型 = 'deepseek-flash', 最大请求 = 1, 最大输入字节 = 16384, 输出Token = 256, 总超时毫秒 = 20000, fetch函数 = global.fetch } = {}) {
  if (!凭据们.has(凭据) || typeof fetch函数 !== 'function') 失败('CORE_CREDENTIAL_PROVIDER_REQUIRED')
  if (!['deepseek-flash', 'deepseek-v4-pro'].includes(模型)) 失败('CORE_MODEL_INVALID')
  for (const [值, 最小, 最大] of [[最大请求, 1, 64], [最大输入字节, 128, 262144], [输出Token, 1, 4096], [总超时毫秒, 10, 60000]]) if (!Number.isSafeInteger(值) || 值 < 最小 || 值 > 最大) 失败('CORE_BUDGET_INVALID')
  let 已发请求 = 0, 起点 = null, 记录 = null, 同步账本故障 = false, 异步记录 = null, 异步进行中 = false, 异步账本故障 = false, 异步请求未知 = false, 已关闭 = false
  const 待落盘 = new Set()
  const 总中止 = new AbortController()
  async function 异步要一轮({ 消息们, 中止 }) {
    if (已关闭 || 中止?.aborted) 失败('CORE_ABORTED')
    if (异步账本故障) 失败('CORE_LEDGER_FAILED')
    if (异步请求未知) 失败('CORE_REQUEST_UNCERTAIN')
    if (异步进行中) 失败('CORE_REQUEST_BUSY')
    if (已发请求 >= 最大请求) 失败('CORE_REQUEST_BUDGET')
    if (中止 !== undefined && !(中止 instanceof AbortSignal)) 失败('CORE_MODEL_INPUT_INVALID')
    if (!Array.isArray(消息们) || !消息们.length || 消息们.some((一) => !一 || !['system', 'user', 'assistant'].includes(一.role) || typeof 一.content !== 'string')) 失败('CORE_MODEL_INPUT_INVALID')
    const 消息 = 消息们.map(({ role, content }) => ({ role, content }))
    if (Buffer.byteLength(JSON.stringify(消息)) > 最大输入字节) 失败('CORE_INPUT_BUDGET')
    const 钥匙 = 凭据.取()
    起点 ??= performance.now()
    const 剩余 = 总超时毫秒 - (performance.now() - 起点)
    if (剩余 <= 0) 失败('CORE_TIMEOUT')
    // No await before reservation: slow ledger writes cannot let concurrent calls exceed the budget.
    异步进行中 = true
    const 超时 = new AbortController(), 闹钟 = setTimeout(() => 超时.abort(), 剩余)
    const 信号 = AbortSignal.any([总中止.signal, 超时.signal, ...(中止 ? [中止] : [])])
    const 请求编号 = randomUUID(); let reader, 已请求 = false, 终态已开始 = false, 账本操作编号 = null, 账本阶段 = null
    function 返回错误(代码) {
      const 错 = new Error(代码)
      if (异步账本故障 || 异步请求未知) { 错.状态 = 'unknown'; 错.请求编号 = 请求编号; if (异步账本故障) 错.记账阶段 = 账本阶段; if (账本操作编号) 错.操作编号 = 账本操作编号 }
      throw 错
    }
    async function 写账(状态, 代码 = null, 用量 = null) {
      const event = Object.freeze({ 请求编号, 模型, 状态, 代码, 用量 })
      账本阶段 = 状态
      const job = Promise.resolve().then(() => 异步记录(event)); 待落盘.add(job)
      void job.finally(() => 待落盘.delete(job)).catch(() => {})
      try {
        const ack = await 等待有界(job, 信号)
        if (!ack || ack.好 !== true || ack.状态 !== 状态) 失败('CORE_LEDGER_FAILED')
      } catch (e) { 异步账本故障 = true; if (typeof e?.操作编号 === 'string' && /^[a-zA-Z0-9_-]{1,100}$/u.test(e.操作编号)) 账本操作编号 = e.操作编号; throw e }
    }
    try {
      await 写账('started')
      if (performance.now() - 起点 >= 总超时毫秒) 失败('CORE_TIMEOUT')
      if (信号.aborted) 失败('CORE_ABORTED')
      已发请求++; 已请求 = true
      const 挂起 = Promise.resolve(fetch函数('https://api.deepseek.com/chat/completions', {
        method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
        body: JSON.stringify({ model: 模型, messages: 消息, stream: false, thinking: { type: 'disabled' }, max_tokens: 输出Token }), signal: 信号,
      }))
      void 挂起.then((回应) => { if (信号.aborted) void 回应?.body?.cancel().catch(() => {}) }, () => {})
      const 回应 = await 等待有界(挂起, 信号)
      if (!回应.ok) { void 回应.body?.cancel().catch(() => {}); 失败(({ 401: 'CORE_AUTH_FAILED', 402: 'CORE_BALANCE_EMPTY', 429: 'CORE_RATE_LIMITED' })[回应.status] || 'CORE_HTTP_FAILED') }
      if (!回应.body || !/application\/json/iu.test(回应.headers.get('content-type') || '')) 失败('CORE_RESPONSE_INVALID')
      reader = 回应.body.getReader(); const 块们 = []; let 字节数 = 0
      while (true) { const 一 = await 等待有界(reader.read(), 信号); if (一.done) break; 字节数 += 一.value.byteLength; if (字节数 > 131072) 失败('CORE_RESPONSE_LIMIT'); 块们.push(Buffer.from(一.value)) }
      const 包 = JSON.parse(Buffer.concat(块们).toString('utf8')), 选择 = 包?.choices?.[0], 文本 = 选择?.message?.content
      if (typeof 文本 !== 'string' || !文本.trim() || 文本.length > 8000 || 选择.finish_reason !== 'stop' || 选择.message.tool_calls?.length) 失败('CORE_RESPONSE_INVALID')
      const 原 = 包.usage, 用量 = 原 && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every((键) => Number.isSafeInteger(原[键]) && 原[键] >= 0) && 原.total_tokens === 原.prompt_tokens + 原.completion_tokens ? { prompt_tokens: 原.prompt_tokens, completion_tokens: 原.completion_tokens, total_tokens: 原.total_tokens } : null
      终态已开始 = true; await 写账('succeeded', null, 用量)
      if (信号.aborted) 失败('CORE_ABORTED')
      return { 全文: 文本, 用了: 用量, 用量已登记: true, 想过: '', 结束原因: 'stop' }
    } catch (错) {
      if (已请求 && 信号.aborted) 异步请求未知 = true
      const 固定 = new Set(['CORE_AUTH_FAILED', 'CORE_BALANCE_EMPTY', 'CORE_RATE_LIMITED', 'CORE_HTTP_FAILED', 'CORE_RESPONSE_INVALID', 'CORE_RESPONSE_LIMIT', 'CORE_TIMEOUT'])
      const 代码 = 超时.signal.aborted ? 'CORE_TIMEOUT' : 信号.aborted ? 'CORE_ABORTED' : 异步账本故障 ? 'CORE_LEDGER_FAILED' : 固定.has(错?.message) ? 错.message : 'CORE_MODEL_FAILED'
      if (已请求 && !信号.aborted && !终态已开始 && !异步账本故障) {
        终态已开始 = true
        try { await 写账('unknown', 代码) } catch { 返回错误(超时.signal.aborted ? 'CORE_TIMEOUT' : 信号.aborted ? 'CORE_ABORTED' : 'CORE_LEDGER_FAILED') }
      }
      返回错误(代码)
    } finally { clearTimeout(闹钟); 异步进行中 = false; if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() } }
  }
  const 连接 = Object.freeze({ 模式: 'real', 模型,
    绑定记录(函数) { if (记录 || 异步记录 || typeof 函数 !== 'function') 失败('CORE_LEDGER_REQUIRED'); 记录 = 函数 },
    绑定异步记录(函数) { if (记录 || 异步记录 || typeof 函数 !== 'function') 失败('CORE_LEDGER_REQUIRED'); 异步记录 = 函数 },
    关闭() { 已关闭 = true; 总中止.abort() },
    async 等待记账排空({ 中止 } = {}) {
      if (!已关闭 || !异步记录) 失败('CORE_LEDGER_REQUIRED')
      if (中止 !== undefined && !(中止 instanceof AbortSignal)) 失败('CORE_MODEL_INPUT_INVALID')
      await 等待有界(Promise.allSettled([...待落盘]), 中止)
    },
    取状态: () => ({ 已发请求, 最大请求, 输出Token, 最大输入字节, 总超时毫秒, 已关闭 }),
    async 要一轮({ 消息们, 中止 }) {
      if (异步记录) return 异步要一轮({ 消息们, 中止 })
      if (已关闭 || 中止?.aborted) 失败('CORE_ABORTED')
      if (!记录) 失败('CORE_LEDGER_REQUIRED')
      if (同步账本故障) 失败('CORE_LEDGER_FAILED')
      if (已发请求 >= 最大请求) 失败('CORE_REQUEST_BUDGET')
      if (!Array.isArray(消息们) || !消息们.length || 消息们.some((一) => !一 || !['system', 'user', 'assistant'].includes(一.role) || typeof 一.content !== 'string')) 失败('CORE_MODEL_INPUT_INVALID')
      const 消息 = 消息们.map(({ role, content }) => ({ role, content }))
      if (Buffer.byteLength(JSON.stringify(消息)) > 最大输入字节) 失败('CORE_INPUT_BUDGET')
      const 钥匙 = 凭据.取()
      起点 ??= performance.now()
      const 剩余 = 总超时毫秒 - (performance.now() - 起点)
      if (剩余 <= 0) 失败('CORE_TIMEOUT')
      const 超时 = new AbortController(), 闹钟 = setTimeout(() => 超时.abort(), 剩余)
      const 信号 = AbortSignal.any([总中止.signal, 超时.signal, ...(中止 ? [中止] : [])])
      const 请求编号 = randomUUID(); let reader, 已请求 = false
      const 写账 = (状态, 代码 = null, 用量 = null) => {
        const result = 记录(Object.freeze({ 请求编号, 模型, 状态, 代码, 用量 }))
        if (result && typeof result.then === 'function') { 同步账本故障 = true; void Promise.resolve(result).catch(() => {}); 失败('CORE_LEDGER_ASYNC_UNSUPPORTED') }
      }
      try {
        写账('started')
        if (performance.now() - 起点 >= 总超时毫秒) 失败('CORE_TIMEOUT')
        if (信号.aborted) 失败('CORE_ABORTED')
        已发请求++; 已请求 = true
        const 挂起 = Promise.resolve(fetch函数('https://api.deepseek.com/chat/completions', {
          method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
          body: JSON.stringify({ model: 模型, messages: 消息, stream: false, thinking: { type: 'disabled' }, max_tokens: 输出Token }), signal: 信号,
        }))
        // 不配合abort的受信测试transport迟到时，取消它的body，且不再写账/保存。
        void 挂起.then((回应) => { if (信号.aborted) void 回应?.body?.cancel().catch(() => {}) }, () => {})
        const 回应 = await 等待有界(挂起, 信号)
        if (!回应.ok) { void 回应.body?.cancel().catch(() => {}); 失败(({ 401: 'CORE_AUTH_FAILED', 402: 'CORE_BALANCE_EMPTY', 429: 'CORE_RATE_LIMITED' })[回应.status] || 'CORE_HTTP_FAILED') }
        if (!回应.body || !/application\/json/iu.test(回应.headers.get('content-type') || '')) 失败('CORE_RESPONSE_INVALID')
        reader = 回应.body.getReader(); const 块们 = []; let 字节数 = 0
        while (true) {
          const 一 = await 等待有界(reader.read(), 信号); if (一.done) break
          字节数 += 一.value.byteLength; if (字节数 > 131072) 失败('CORE_RESPONSE_LIMIT'); 块们.push(Buffer.from(一.value))
        }
        const 包 = JSON.parse(Buffer.concat(块们).toString('utf8')), 选择 = 包?.choices?.[0], 文本 = 选择?.message?.content
        if (typeof 文本 !== 'string' || !文本.trim() || 文本.length > 8000 || 选择.finish_reason !== 'stop' || 选择.message.tool_calls?.length) 失败('CORE_RESPONSE_INVALID')
        const 原 = 包.usage
        const 用量 = 原 && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every((键) => Number.isSafeInteger(原[键]) && 原[键] >= 0) && 原.total_tokens === 原.prompt_tokens + 原.completion_tokens
          ? { prompt_tokens: 原.prompt_tokens, completion_tokens: 原.completion_tokens, total_tokens: 原.total_tokens } : null
        写账('succeeded', null, 用量)
        return { 全文: 文本, 用了: 用量, 用量已登记: true, 想过: '', 结束原因: 'stop' }
      } catch (错) {
        const 固定 = new Set(['CORE_AUTH_FAILED', 'CORE_BALANCE_EMPTY', 'CORE_RATE_LIMITED', 'CORE_HTTP_FAILED', 'CORE_RESPONSE_INVALID', 'CORE_RESPONSE_LIMIT', 'CORE_TIMEOUT'])
        const 代码 = 超时.signal.aborted ? 'CORE_TIMEOUT' : 信号.aborted ? 'CORE_ABORTED' : 固定.has(错?.message) ? 错.message : 'CORE_MODEL_FAILED'
        if (已请求 && !信号.aborted) { try { 写账('unknown', 代码) } catch { /* started已记录，不伪造零花费 */ } }
        失败(代码)
      } finally { clearTimeout(闹钟); if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock() } }
    },
  })
  真实连接们.add(连接); return 连接
}
module.exports = { 创建严格凭据, 创建假模型连接, 是假模型连接, 创建真实模型连接, 是真实模型连接 }
