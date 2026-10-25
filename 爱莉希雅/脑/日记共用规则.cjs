/** 日记共用纯规则：从原模块机械移动，无文件/配置/模型依赖。 */
'use strict'
const 记忆叙述 = require('./记忆叙述.cjs')
const 模块名们 = Object.freeze(['回顾', '学习', '工作', '陪伴片段', '未完事项'])
const 日记可见性们 = Object.freeze(['shared', 'private'])
const 是对象 = (值) => !!值 && typeof 值 === 'object' && !Array.isArray(值)
function 正文文本(值) { return String(值 == null ? '' : 值).replace(/\r\n?/g, '\n').trim() }

/**
 * 旧日记没有可见性字段时按 shared 只读兼容；显式但非法的值必须拒绝，
 * 不能因为拼写错误把本应私密的内容降级成共享内容。
 */
function 规范日记可见性(值) {
  if (值 === undefined) return 'shared'
  const 可见性 = String(值).trim()
  if (!日记可见性们.includes(可见性)) throw new Error('日记可见性无效')
  return 可见性
}

function 规范日记记录(值) {
  if (!是对象(值)) throw new Error('日记记录无效')
  return { ...值, 可见性: 规范日记可见性(值.可见性) }
}

function 面向她的日记(日记) {
  return {
    ...日记,
    标题: 记忆叙述.整理日记正文(日记.标题),
    模块: (Array.isArray(日记.模块) ? 日记.模块 : []).map((一) => ({
      ...一,
      正文: 记忆叙述.整理日记正文(一 && 一.正文),
    })),
    来源: (Array.isArray(日记.来源) ? 日记.来源 : []).map((一) => ({
      ...一,
      标题: 记忆叙述.整理正文(一 && 一.标题),
      摘要: 记忆叙述.整理正文(一 && 一.摘要),
    })),
  }
}

/** 所有默认界面、导出和将来的外发渠道都必须先经过这个共享投影。 */
function 共享日记投影(值) {
  const 日记 = 规范日记记录(值)
  return 日记.可见性 === 'shared' ? 面向她的日记(日记) : null
}

const 敏感关键词 = /密码|口令|验证码|恢复码|api\s*key|access\s*token|refresh\s*token|token|cookie|私钥|助记词|账号|账户|银行卡|信用卡|身份证|证件号|手机号|电话号码|精确住址|系统提示|开发者消息|工具原文|调试日志/i
const 敏感形状们 = [
  /\b[A-Za-z]:[\\/][^\s<>"|?*]+/,
  /\\\\[^\s\\/]+[\\/][^\s<>"|?*]+/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|\D)1[3-9]\d{9}(?:\D|$)/,
  /(?:^|\D)\d{15,19}(?:\D|$)/,
  /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/i,
]

function 含敏感信息(值) {
  const 文本 = String(值 == null ? '' : 值)
  return 敏感关键词.test(文本) || 敏感形状们.some((规则) => 规则.test(文本))
}

function 像助手回复(值) {
  const 文本 = 正文文本(值)
  if (!文本) return false
  return /^(好的|当然|没问题|可以呀|可以的|收到|我来|让我来|以下是)/.test(文本)
    || /(建议你|你可以|如果你愿意|还有什么.{0,12}需要|希望以上.{0,12}帮到你|作为(?:一个|一名)?(?:AI|助手)|步骤[：:])/.test(文本)
    || /(?:^|\n)\s*(?:\d+[.)、]|[-*])\s+/.test(文本)
}

module.exports = { 模块名们, 日记可见性们, 规范日记可见性, 规范日记记录, 共享日记投影, 敏感关键词, 含敏感信息, 像助手回复 }
