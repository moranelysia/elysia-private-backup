/** C-11：纯本地渠道契约。只校验与复制值，不收发消息、不读写数据、不判断授权。 */
'use strict'

const 格式版本 = 1
const 限制 = Object.freeze({ 正文字数: 12000, 附件数: 8, 附件字节: 20 * 1024 * 1024 })
const 能力值 = Object.freeze(['supported', 'unsupported', 'unknown'])
const 附件类型 = Object.freeze(['image', 'audio', 'file'])
const 失败代码 = Object.freeze([
  'CAPABILITY_UNSUPPORTED', 'AUTH_REQUIRED', 'FORBIDDEN', 'RATE_LIMITED',
  'CHANNEL_OFFLINE', 'INVALID_MESSAGE', 'EXPIRED', 'SEND_FAILED',
])

function 无效(位置) { throw new TypeError('CHANNEL_CONTRACT_INVALID: ' + 位置) }
function 对象(值, 字段, 位置) {
  if (!值 || typeof 值 !== 'object' || Array.isArray(值)) 无效(位置)
  const 原型 = Object.getPrototypeOf(值)
  if (原型 !== Object.prototype && 原型 !== null) 无效(位置)
  const 描述 = Object.getOwnPropertyDescriptors(值)
  const 键们 = Reflect.ownKeys(描述)
  if (键们.length !== 字段.length || 键们.some((键) => !字段.includes(键))) 无效(位置 + '.字段')
  for (const 键 of 字段) {
    if (!Object.hasOwn(描述, 键) || !Object.hasOwn(描述[键], 'value') || !描述[键].enumerable) 无效(位置 + '.字段')
  }
}
function 字符串(值, 上限, 位置, 可空 = false) {
  if (typeof 值 !== 'string' || 值.length > 上限 || (!可空 && !值.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(值)) 无效(位置)
}
function 编号(值, 位置) {
  字符串(值, 160, 位置)
  if (值 !== 值.trim() || /\s/u.test(值)) 无效(位置)
}
function 可空编号(值, 位置) { if (值 !== null) 编号(值, 位置) }
function 枚举(值, 值们, 位置) { if (!值们.includes(值)) 无效(位置) }
function 整数(值, 下限, 上限, 位置) { if (!Number.isSafeInteger(值) || 值 < 下限 || 值 > 上限) 无效(位置) }
function 布尔(值, 位置) { if (typeof 值 !== 'boolean') 无效(位置) }
function 数组(值, 上限, 位置) {
  if (!Array.isArray(值) || Object.getPrototypeOf(值) !== Array.prototype || 值.length > 上限) 无效(位置)
  const 描述 = Object.getOwnPropertyDescriptors(值)
  if (Reflect.ownKeys(描述).length !== 值.length + 1) 无效(位置)
  for (let i = 0; i < 值.length; i++) {
    if (!Object.hasOwn(描述, i) || !Object.hasOwn(描述[i], 'value') || !描述[i].enumerable) 无效(位置)
  }
}
function 时间(值, 位置) {
  if (typeof 值 !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(值)) 无效(位置)
  const 时刻 = new Date(值)
  if (!Number.isFinite(时刻.getTime()) || 时刻.toISOString() !== 值) 无效(位置)
}
function 端点(值) {
  对象(值, ['渠道', '账号'], '端点')
  if (typeof 值.渠道 !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/u.test(值.渠道)) 无效('端点.渠道')
  编号(值.账号, '端点.账号')
}
function 会话(值) {
  对象(值, ['类型', '编号'], '会话')
  枚举(值.类型, ['private', 'group'], '会话.类型')
  编号(值.编号, '会话.编号')
}
function 基础(值, 字段, 名字) {
  对象(值, ['版本', '端点', ...字段], 名字)
  if (值.版本 !== 格式版本) 无效(名字 + '.版本')
  端点(值.端点)
}
function 内容(值) {
  字符串(值.正文, 限制.正文字数, '正文', true)
  数组(值.附件, 限制.附件数, '附件')
  const 编号们 = new Set()
  for (const 一 of 值.附件) {
    对象(一, ['编号', '类型', '名称', '媒体类型', '字节数'], '附件项')
    编号(一.编号, '附件项.编号')
    // 只允许受控附件仓库的编号；本机路径、远端URL与下载凭据不进入消息契约。
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(一.编号) || 编号们.has(一.编号)) 无效('附件项.编号')
    编号们.add(一.编号)
    枚举(一.类型, 附件类型, '附件项.类型')
    字符串(一.名称, 160, '附件项.名称')
    if (/[\\/]/u.test(一.名称)) 无效('附件项.名称')
    if (typeof 一.媒体类型 !== 'string' || 一.媒体类型.length > 100 || !/^[\w.+-]+\/[\w.+-]+$/u.test(一.媒体类型)) 无效('附件项.媒体类型')
    整数(一.字节数, 0, 限制.附件字节, '附件项.字节数')
  }
  if (!值.正文.trim() && !值.附件.length) 无效('内容为空')
}
function 副本(值) { return JSON.parse(JSON.stringify(值)) }

function 校验接收消息(值) {
  基础(值, ['会话', '发送者编号', '消息编号', '发生于', '接收于', '回复消息编号', '正文', '附件'], '接收消息')
  会话(值.会话)
  编号(值.发送者编号, '发送者编号')
  编号(值.消息编号, '消息编号')
  if (值.发生于 !== null) 时间(值.发生于, '发生于')
  时间(值.接收于, '接收于')
  可空编号(值.回复消息编号, '回复消息编号')
  内容(值)
  return 副本(值)
}

function 校验发送消息(值) {
  基础(值, ['会话', '接收者编号', '请求编号', '用途', '回复消息编号', '创建于', '截止于', '可见性', '正文', '附件'], '发送消息')
  会话(值.会话)
  编号(值.接收者编号, '接收者编号')
  编号(值.请求编号, '请求编号')
  枚举(值.用途, ['reply', 'proactive'], '用途')
  if (值.用途 === 'reply') 编号(值.回复消息编号, '回复消息编号')
  else if (值.回复消息编号 !== null) 无效('回复消息编号')
  时间(值.创建于, '创建于')
  if (值.截止于 !== null) {
    时间(值.截止于, '截止于')
    if (值.截止于 <= 值.创建于) 无效('截止于')
  }
  if (值.可见性 !== 'shared') 无效('可见性')
  内容(值)
  return 副本(值)
}

function 校验渠道能力(值) {
  基础(值, ['回复', '主动发送', '流式', '取消', '正文上限', '单次附件上限', '附件类型', '回复窗口'], '渠道能力')
  for (const 键 of ['回复', '主动发送', '流式', '取消']) 枚举(值[键], 能力值, '渠道能力.' + 键)
  整数(值.正文上限, 1, 限制.正文字数, '渠道能力.正文上限')
  整数(值.单次附件上限, 0, 限制.附件数, '渠道能力.单次附件上限')
  数组(值.附件类型, 附件类型.length, '渠道能力.附件类型')
  if (new Set(值.附件类型).size !== 值.附件类型.length) 无效('渠道能力.附件类型')
  for (const 一 of 值.附件类型) 枚举(一, 附件类型, '渠道能力.附件类型')
  if ((值.单次附件上限 === 0) !== (值.附件类型.length === 0)) 无效('渠道能力.附件类型')
  对象(值.回复窗口, ['类型', '秒数'], '渠道能力.回复窗口')
  枚举(值.回复窗口.类型, ['unknown', 'unlimited', 'seconds'], '渠道能力.回复窗口.类型')
  if (值.回复窗口.类型 === 'seconds') 整数(值.回复窗口.秒数, 1, 86400 * 30, '渠道能力.回复窗口.秒数')
  else if (值.回复窗口.秒数 !== null) 无效('渠道能力.回复窗口.秒数')
  return 副本(值)
}

function 校验发送结果(值) {
  基础(值, ['请求编号', '状态', '渠道消息编号', '错误代码', '可重试', '结束于'], '发送结果')
  编号(值.请求编号, '请求编号')
  枚举(值.状态, ['sent', 'failed', 'unknown', 'cancelled'], '发送结果.状态')
  可空编号(值.渠道消息编号, '渠道消息编号')
  布尔(值.可重试, '可重试')
  时间(值.结束于, '结束于')
  if (值.状态 === 'sent') {
    编号(值.渠道消息编号, '渠道消息编号')
    if (值.错误代码 !== null || 值.可重试) 无效('发送结果.状态组合')
  } else {
    if (值.渠道消息编号 !== null) 无效('渠道消息编号')
    if (值.状态 === 'failed') {
      枚举(值.错误代码, 失败代码, '错误代码')
      if (值.可重试 && !['RATE_LIMITED', 'CHANNEL_OFFLINE', 'SEND_FAILED'].includes(值.错误代码)) 无效('可重试')
    } else if (值.错误代码 !== (值.状态 === 'unknown' ? 'DELIVERY_UNKNOWN' : 'CANCELLED') || 值.可重试) 无效('发送结果.状态组合')
  }
  return 副本(值)
}

function 校验取消请求(值) {
  基础(值, ['会话', '发送者编号', '请求编号', '取消编号', '请求于'], '取消请求')
  会话(值.会话)
  for (const 键 of ['发送者编号', '请求编号', '取消编号']) 编号(值[键], 键)
  时间(值.请求于, '请求于')
  return 副本(值)
}

/** 使用JSON元组保留边界，避免简单拼接编号导致歧义；键不是权限令牌，也不直接作文件名。 */
function 会话定位键(值) {
  对象(值, ['端点', '会话', '发送者编号'], '会话定位')
  端点(值.端点)
  会话(值.会话)
  编号(值.发送者编号, '发送者编号')
  return JSON.stringify([值.端点.渠道, 值.端点.账号, 值.会话.类型, 值.会话.编号, 值.发送者编号])
}
function 接收去重键(值) {
  const 一 = 校验接收消息(值)
  return JSON.stringify([会话定位键({ 端点: 一.端点, 会话: 一.会话, 发送者编号: 一.发送者编号 }), 一.消息编号])
}
function 发送去重键(值) {
  const 一 = 校验发送消息(值)
  return JSON.stringify([一.端点.渠道, 一.端点.账号, 一.请求编号])
}

module.exports = {
  格式版本, 限制, 能力值, 附件类型, 失败代码,
  校验接收消息, 校验发送消息, 校验渠道能力, 校验发送结果, 校验取消请求,
  会话定位键, 接收去重键, 发送去重键,
}
