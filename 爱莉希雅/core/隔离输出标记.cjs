/** Explicitly injected original parsing rules; no files, model calls or side effects. */
'use strict'
const fail = code => { throw Error('ISOLATED_OUTPUT_' + code) }
const 品牌 = new WeakSet()
function 创建隔离输出标记({ 拆标记, 拆工具 } = {}) {
  if (typeof 拆标记 !== 'function' || typeof 拆工具 !== 'function') fail('DEPENDENCY_INVALID')
  const api = Object.freeze({ 解析(全文) {
    if (typeof 全文 !== 'string') fail('INPUT_INVALID')
    const value = 拆标记(全文)
    if (!value || typeof value.正文 !== 'string' || !['表情', '记住', '经历', '更正事实'].every(k => Array.isArray(value[k]))) fail('DEPENDENCY_INVALID')
    const clean = 拆工具(value.正文)
    if (!clean || typeof clean.正文 !== 'string') fail('DEPENDENCY_INVALID')
    // 不让未闭合或格式错误的已知内部标记进入可见正文和历史。
    if (/[\[【]\s*(?:表情|记住|经历|更正事实)\s*[:：]/u.test(clean.正文)) fail('INCOMPLETE_MARKER')
    return { 正文: clean.正文, 待写记忆: value.记住.length > 0 || value.经历.length > 0 || value.更正事实.length > 0 }
  } })
  品牌.add(api); return api
}
function 是隔离输出标记(value) { return 品牌.has(value) }
module.exports = { 创建隔离输出标记, 是隔离输出标记 }
