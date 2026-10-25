/** C-14：权限审查后的地址映射；默认内存，持久化须显式提供文件，绝不导入正式记忆模块。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const 契约 = require('./渠道契约.cjs')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 编号格式 = /^channel-[a-z0-9][a-z0-9_-]{0,95}$/u
const 编号有效 = (值) => typeof 值 === 'string' && 编号格式.exec(值)?.[0] === 值
const 固定错误 = new Set(['MAP_CLOSED', 'STORE_CORRUPT', 'STORE_UNAVAILABLE', 'STORE_BUSY', 'STORE_WRITE_FAILED', 'ID_CONFLICT', 'MAP_FULL'])
function 故障(代码) { throw new Error(代码) }
function 失败(代码) { return { 好: false, 错误代码: 代码 } }
function 定位(消息) { return 契约.会话定位键({ 端点: 消息.端点, 会话: 消息.会话, 发送者编号: 消息.发送者编号 }) }

function 创建渠道会话映射({ 权限, 文件 = null, 存储 = null, 生成编号 = () => 'channel-' + randomUUID(), 最大记录数 = 4096 } = {}) {
  if (!权限 || typeof 权限.核对接收许可 !== 'function') throw new TypeError('CHANNEL_MAP_POLICY_INVALID')
  if (文件 !== null && (typeof 文件 !== 'string' || !path.isAbsolute(文件) || path.extname(文件) !== '.json')) throw new TypeError('CHANNEL_MAP_FILE_INVALID')
  if (typeof 生成编号 !== 'function' || !Number.isSafeInteger(最大记录数) || 最大记录数 < 1 || 最大记录数 > 4096) throw new TypeError('CHANNEL_MAP_OPTIONS_INVALID')
  if (存储 !== null && (文件 !== null || ['读取', '保存', '关闭'].some((名) => typeof 存储[名] !== 'function'))) throw new TypeError('CHANNEL_MAP_BACKEND_INVALID')
  let 已关闭 = false
  let 已见文件 = false
  let 内存 = new Map()
  function 读文件() {
    if (文件 === null && 存储 === null) return 内存
    let 原文
    try { if (存储 !== null) { const 已存 = 存储.读取(); if (已存 === null) return new Map(); 原文 = JSON.stringify(已存) } else {
      const 大小 = fs.statSync(文件).size
      已见文件 = true
      if (大小 > 8 * 1024 * 1024) 故障('STORE_CORRUPT')
      原文 = fs.readFileSync(文件, 'utf8')
    }
    } catch (错) {
      if (错.code === 'ENOENT' && !已见文件) return new Map()
      if (错.message === 'STORE_CORRUPT') throw 错
      故障('STORE_UNAVAILABLE')
    }
    try {
      const 数据 = JSON.parse(原文)
      if (!数据 || Object.keys(数据).length !== 2 || 数据.版本 !== 1 || !Array.isArray(数据.记录) || 数据.记录.length > 最大记录数) 故障('STORE_CORRUPT')
      const 表 = new Map(), 编号们 = new Set()
      for (const 一 of 数据.记录) {
        if (!一 || Object.keys(一).length !== 4 || !编号有效(一.内部对话编号)) 故障('STORE_CORRUPT')
        const 键 = 定位(一)
        if (一.会话.类型 !== 'private' || 表.has(键) || 编号们.has(一.内部对话编号)) 故障('STORE_CORRUPT')
        表.set(键, 一); 编号们.add(一.内部对话编号)
      }
      return 表
    } catch { 故障('STORE_CORRUPT') }
  }
  function 分配(表, 消息) {
    if (表.size >= 最大记录数) 故障('MAP_FULL')
    const 已有 = new Set([...表.values()].map((一) => 一.内部对话编号))
    for (let i = 0; i < 5; i++) {
      const 编号 = 生成编号()
      if (!编号有效(编号)) 故障('ID_CONFLICT')
      if (已有.has(编号)) continue
      const 条 = { 端点: 拷贝(消息.端点), 会话: 拷贝(消息.会话), 发送者编号: 消息.发送者编号, 内部对话编号: 编号 }
      const 新表 = new Map(表)
      新表.set(定位(消息), 条)
      return { 新表, 条 }
    }
    故障('ID_CONFLICT')
  }
  function 写新映射(消息) {
    if (存储 !== null) {
      try {
        const 表 = 读文件(), 已有 = 表.get(定位(消息)); if (已有) return { 条: 已有, 新建: false }
        const 果 = 分配(表, 消息); 存储.保存({ 版本: 1, 记录: [...果.新表.values()] }); return { 条: 果.条, 新建: true }
      } catch (错) { if (固定错误.has(错.message)) throw 错; 故障('STORE_WRITE_FAILED') }
    }
    if (文件 === null) {
      const 果 = 分配(内存, 消息); 内存 = 果.新表
      return { 条: 果.条, 新建: true }
    }
    let 锁 = null, 临时句柄 = null, 临时文件 = null
    try {
      fs.mkdirSync(path.dirname(文件), { recursive: true })
      try { 锁 = fs.openSync(文件 + '.lock', 'wx', 0o600) } catch (错) { if (错.code === 'EEXIST') 故障('STORE_BUSY'); throw 错 }
      // 锁内重读，防止另一个实例完成写入后仍用旧快照覆盖。
      const 表 = 读文件(), 已有 = 表.get(定位(消息))
      if (已有) return { 条: 已有, 新建: false }
      const 果 = 分配(表, 消息)
      const 新临时文件 = 文件 + '.' + randomUUID() + '.tmp'
      临时句柄 = fs.openSync(新临时文件, 'wx', 0o600)
      临时文件 = 新临时文件
      fs.writeFileSync(临时句柄, JSON.stringify({ 版本: 1, 记录: [...果.新表.values()] }, null, 2), 'utf8')
      fs.fsyncSync(临时句柄)
      fs.closeSync(临时句柄); 临时句柄 = null
      fs.renameSync(临时文件, 文件); 临时文件 = null
      已见文件 = true
      return { 条: 果.条, 新建: true }
    } catch (错) {
      if (固定错误.has(错.message)) throw 错
      故障('STORE_WRITE_FAILED')
    } finally {
      if (临时句柄 !== null) { try { fs.closeSync(临时句柄) } catch {} }
      if (临时文件 !== null) { try { fs.unlinkSync(临时文件) } catch {} }
      if (锁 !== null) {
        try { fs.closeSync(锁) } catch {}
        try { fs.unlinkSync(文件 + '.lock') } catch {}
      }
    }
  }
  function 解析(输入, 上下文, 创建) {
    if (已关闭) return 失败('MAP_CLOSED')
    let 消息
    try { 消息 = 契约.校验接收消息(输入) } catch { return 失败('INVALID_CONTRACT') }
    // 许可验证先于任何存储读取，不能用来探测别人的映射或凭原始ID新签发许可。
    if (!权限.核对接收许可(消息, 上下文).允许) return 失败('FORBIDDEN')
    try {
      const 已有 = 读文件().get(定位(消息))
      if (已有) return { 好: true, 存在: true, 内部对话编号: 已有.内部对话编号, 新建: false }
      if (!创建) return { 好: true, 存在: false, 内部对话编号: null, 新建: false }
      const 果 = 写新映射(消息)
      return { 好: true, 存在: true, 内部对话编号: 果.条.内部对话编号, 新建: 果.新建 }
    } catch (错) { return 失败(固定错误.has(错.message) ? 错.message : 'STORE_UNAVAILABLE') }
  }
  function 关闭() { if (已关闭) return; 已关闭 = true; 内存.clear(); 存储?.关闭() }
  return Object.freeze({
    解析接收: (消息, 上下文 = {}) => 解析(消息, 上下文, true),
    查询接收: (消息, 上下文 = {}) => 解析(消息, 上下文, false),
    取状态: () => ({ 已关闭, 持久化: 文件 !== null || 存储 !== null }),
    关闭,
  })
}

/** 组合C-13守卫；只分配编号并交给显式注入的测试处理函数，不创建正式对话或读取历史。 */
function 创建渠道会话路由({ 守卫, 映射 } = {}) {
  if (!守卫 || typeof 守卫.订阅接收 !== 'function' || !映射 || typeof 映射.解析接收 !== 'function') throw new TypeError('CHANNEL_ROUTER_INVALID')
  const 订阅们 = new Set()
  let 已关闭 = false
  function 订阅接收(处理) {
    if (已关闭 || typeof 处理 !== 'function') throw new TypeError('CHANNEL_ROUTER_HANDLER_INVALID')
    const 停止 = 守卫.订阅接收(async (消息, 上下文) => {
      if (已关闭) return
      const 果 = 映射.解析接收(消息, 上下文)
      if (!果.好) {
        if (果.错误代码 !== 'FORBIDDEN') throw new Error('CHANNEL_ROUTE_' + 果.错误代码)
        return
      }
      await 处理(消息, Object.freeze({ 内部对话编号: 果.内部对话编号, 回复许可: 上下文.回复许可 }))
    })
    let 已取消 = false
    const 退出 = () => { if (!已取消) { 已取消 = true; 订阅们.delete(退出); 停止() } }
    订阅们.add(退出)
    return 退出
  }
  function 关闭() { 已关闭 = true; for (const 停止 of [...订阅们]) 停止() }
  return Object.freeze({ 订阅接收, 关闭 })
}

module.exports = { 创建渠道会话映射, 创建渠道会话路由 }
