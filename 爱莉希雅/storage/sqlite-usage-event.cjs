/** Shared headless event validation. Contains no credentials or network access. */
'use strict'
const { 纯数据 } = require('./sqlite-state.cjs')
const { exact } = require('./sqlite-worker-protocol.cjs')
const fail = code => { throw Error('ASYNC_USAGE_' + code) }
const errors = new Set(['CORE_AUTH_FAILED', 'CORE_BALANCE_EMPTY', 'CORE_RATE_LIMITED', 'CORE_HTTP_FAILED', 'CORE_RESPONSE_INVALID', 'CORE_RESPONSE_LIMIT', 'CORE_TIMEOUT', 'CORE_ABORTED', 'CORE_MODEL_FAILED'])
const utc = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x
function 校验无界面用量事件(input, time) {
  if (!utc(time)) fail('TIME_INVALID')
  const x = 纯数据(input); exact(x, ['请求编号', '模型', '状态', '代码', '用量'])
  if (typeof x.请求编号 !== 'string' || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.exec(x.请求编号)?.[0] !== x.请求编号 || !['deepseek-flash', 'deepseek-v4-pro'].includes(x.模型) || !['started', 'succeeded', 'unknown'].includes(x.状态) || (x.代码 !== null && !errors.has(x.代码))) fail('DATA_INVALID')
  if ((x.状态 === 'started' && (x.代码 !== null || x.用量 !== null)) || (x.状态 === 'succeeded' && x.代码 !== null) || (x.状态 === 'unknown' && (x.用量 !== null || x.代码 === null))) fail('DATA_INVALID')
  if (x.用量 !== null) { exact(x.用量, ['prompt_tokens', 'completion_tokens', 'total_tokens']); if (!Object.values(x.用量).every(v => Number.isSafeInteger(v) && v >= 0) || x.用量.total_tokens !== x.用量.prompt_tokens + x.用量.completion_tokens) fail('DATA_INVALID') }
  return { 时间: time, ...x }
}
module.exports = { 校验无界面用量事件 }
