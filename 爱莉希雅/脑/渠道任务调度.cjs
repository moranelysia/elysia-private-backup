/** C-15：受信渠道的持久去重/单写任务与显式推进；不接生产核心，不自建后台计时器。 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const 契约 = require('./渠道契约.cjs')
const 已挂接守卫 = new WeakSet()
const 已挂接存储 = new WeakSet()
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 哈希 = (值) => createHash('sha256').update(JSON.stringify(值)).digest('hex')
const 状态们 = ['processing', 'queued', 'sending', 'sent', 'failed', 'unknown', 'cancelled', 'interrupted', 'blocked', 'expired']
const 事件们 = ['received', 'duplicate', 'conflict', 'queued', 'sending', 'sent', 'retry', 'failed', 'unknown', 'cancelled', 'blocked', 'expired', 'interrupted']
const 代码们 = [null, ...契约.失败代码, 'DELIVERY_UNKNOWN', 'CANCELLED', 'INVALID_DRAFT', 'PROCESSING_FAILED', 'PROCESSING_INTERRUPTED', 'MESSAGE_CONFLICT', 'RETRY_EXHAUSTED']
const 接收字段 = ['端点', '会话', '发送者编号', '消息编号']
const 任务字段 = ['编号', '来源键', '输入指纹', '来源', '内部对话编号', '状态', '发送', '尝试', '下次尝试于', '代码', '创建于', '更新于', '回执']
function 失败(码) { throw new Error(码) }
function 严格键(值, 键们) {
  if (!值 || Object.getPrototypeOf(值) !== Object.prototype) 失败('TASK_DATA_INVALID')
  const 描述 = Object.getOwnPropertyDescriptors(值), 键 = Reflect.ownKeys(描述)
  if (键.length !== 键们.length || 键.some((一) => !键们.includes(一) || !Object.hasOwn(描述[一], 'value') || !描述[一].enumerable)) 失败('TASK_DATA_INVALID')
}
function 时间有效(值) { return typeof 值 === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(值) && Number.isFinite(Date.parse(值)) && new Date(值).toISOString() === 值 }
function 安全编号(值, 前缀) { return typeof 值 === 'string' && 值.startsWith(前缀) && 值.length > 前缀.length && /^[a-z0-9_-]+$/u.exec(值)?.[0] === 值 && 值.length <= 104 }
function 输入指纹(消息) {
  // 接收于是本次到达时间；重连重放可以变化，原发生时间和载荷不能偷换。
  return 哈希([消息.端点.渠道, 消息.端点.账号, 消息.会话.类型, 消息.会话.编号, 消息.发送者编号, 消息.消息编号, 消息.发生于, 消息.回复消息编号, 消息.正文,
    消息.附件.map((一) => [一.编号, 一.类型, 一.名称, 一.媒体类型, 一.字节数])])
}

function 创建渠道任务调度({ 守卫, 权限, 映射, 处理, 文件 = null, 存储 = null, 取现在 = () => new Date(), 最小间隔毫秒 = 1000, 重试延迟毫秒 = 2000, 最大尝试 = 3, 任务有效毫秒 = 600000, 最大记录数 = 4096 } = {}) {
  for (const [对象, 方法们] of [[守卫, ['取能力', '订阅接收', '发送']], [权限, ['核对接收许可', '审查发送', '订阅变更']], [映射, ['解析接收']]]) {
    if (!对象 || 方法们.some((名) => typeof 对象[名] !== 'function')) 失败('TASK_DEPENDENCY_INVALID')
  }
  if (typeof 处理 !== 'function' || typeof 取现在 !== 'function') 失败('TASK_HANDLER_INVALID')
  for (const [值, 下限, 上限] of [[最小间隔毫秒, 1, 86400000], [重试延迟毫秒, 1, 86400000], [最大尝试, 1, 5], [任务有效毫秒, 1, 86400000], [最大记录数, 1, 4096]]) {
    if (!Number.isSafeInteger(值) || 值 < 下限 || 值 > 上限) 失败('TASK_OPTIONS_INVALID')
  }
  if (文件 !== null && (typeof 文件 !== 'string' || !path.isAbsolute(文件) || path.extname(文件) !== '.json')) 失败('TASK_FILE_INVALID')
  if (存储 !== null && (文件 !== null || ['读取', '保存', '关闭'].some((名) => typeof 存储[名] !== 'function'))) 失败('TASK_BACKEND_INVALID')
  if (存储 !== null && 已挂接存储.has(存储)) 失败('TASK_BACKEND_IN_USE')
  const 端点 = 契约.校验渠道能力(守卫.取能力()).端点
  const 同端点 = (一) => 一.渠道 === 端点.渠道 && 一.账号 === 端点.账号
  function 现在() { const 值 = 取现在(); if (!(值 instanceof Date) || !Number.isFinite(值.getTime()) || !时间有效(值.toISOString())) 失败('TASK_CLOCK_INVALID'); return 值.toISOString() }
  现在()
  let 已关闭 = false, 故障 = null, 锁 = null, 已见文件 = false, 退订 = null, 退权限 = null
  let 泵 = null, 再推进 = false, 核心链 = Promise.resolve()
  const 许可们 = new Map(), 中止 = new AbortController(), 核心中止们 = new Set()
  let 数据 = { 版本: 1, 端点: 拷贝(端点), 最近发送于: null, 记录: [], 日志: [] }

  function 核对数据(值) {
    严格键(值, ['版本', '端点', '最近发送于', '记录', '日志'])
    if (值.版本 !== 1 || !同端点(值.端点) || (值.最近发送于 !== null && !时间有效(值.最近发送于)) || !Array.isArray(值.记录) || 值.记录.length > 4096 || !Array.isArray(值.日志) || 值.日志.length > 100) 失败('TASK_DATA_INVALID')
    严格键(值.端点, ['渠道', '账号'])
    const 键们 = new Set(), 编号们 = new Set()
    for (const 一 of 值.记录) {
      严格键(一, 任务字段); 严格键(一.来源, 接收字段)
      const 源 = 契约.校验接收消息({ 版本: 1, ...一.来源, 发生于: null, 接收于: 一.创建于, 回复消息编号: null, 正文: 'metadata', 附件: [] })
      if (!同端点(源.端点) || 源.会话.类型 !== 'private' || 一.来源键 !== 哈希(契约.接收去重键(源)) || typeof 一.输入指纹 !== 'string' || /^[a-f0-9]{64}$/u.exec(一.输入指纹)?.[0] !== 一.输入指纹 || !安全编号(一.编号, 'task-') || !安全编号(一.内部对话编号, 'channel-') || 键们.has(一.来源键) || 编号们.has(一.编号)) 失败('TASK_DATA_INVALID')
      if (!状态们.includes(一.状态) || !代码们.includes(一.代码) || !Number.isSafeInteger(一.尝试) || 一.尝试 < 0 || 一.尝试 > 5 || !时间有效(一.更新于) || (一.下次尝试于 !== null && !时间有效(一.下次尝试于))) 失败('TASK_DATA_INVALID')
      键们.add(一.来源键); 编号们.add(一.编号)
      if (一.发送 !== null) {
        const 发 = 契约.校验发送消息(一.发送)
        if (!同端点(发.端点) || 发.会话.类型 !== 源.会话.类型 || 发.会话.编号 !== 源.会话.编号 || 发.接收者编号 !== 源.发送者编号 || 发.回复消息编号 !== 源.消息编号 || 发.用途 !== 'reply' || 发.请求编号 !== 'c15-' + 一.来源键 || 发.截止于 === null) 失败('TASK_DATA_INVALID')
      }
      if (一.回执 !== null) {
        const 果 = 契约.校验发送结果(一.回执)
        if (!一.发送 || !同端点(果.端点) || 果.请求编号 !== 一.发送.请求编号) 失败('TASK_DATA_INVALID')
        if (['sent', 'unknown', 'cancelled'].includes(一.状态) && 一.状态 !== 果.状态) 失败('TASK_DATA_INVALID')
      }
      if (['queued', 'sending', 'sent', 'unknown', 'cancelled', 'expired'].includes(一.状态) && !一.发送) 失败('TASK_DATA_INVALID')
      if (一.状态 === 'queued' && (!一.下次尝试于 || 一.尝试 >= 5 || (一.回执 && (一.回执.状态 !== 'failed' || !一.回执.可重试)))) 失败('TASK_DATA_INVALID')
      if (一.状态 !== 'queued' && 一.下次尝试于 !== null) 失败('TASK_DATA_INVALID')
      if (['processing', 'interrupted'].includes(一.状态) && (一.发送 || 一.尝试 || 一.回执)) 失败('TASK_DATA_INVALID')
      if (['sending', 'sent', 'unknown', 'cancelled'].includes(一.状态) && 一.尝试 < 1) 失败('TASK_DATA_INVALID')
      if (['sent', 'unknown', 'cancelled'].includes(一.状态) && !一.回执) 失败('TASK_DATA_INVALID')
      if (一.尝试 > 0 && 值.最近发送于 === null) 失败('TASK_DATA_INVALID')
    }
    for (const 一 of 值.日志) {
      严格键(一, ['于', '事件', '任务', '代码', '尝试'])
      if (!时间有效(一.于) || !事件们.includes(一.事件) || (一.任务 !== null && !安全编号(一.任务, 'task-')) || !代码们.includes(一.代码) || !Number.isSafeInteger(一.尝试) || 一.尝试 < 0 || 一.尝试 > 5) 失败('TASK_DATA_INVALID')
    }
    return 值
  }
  function 释放锁() { if (锁 !== null) { try { fs.closeSync(锁) } catch {}; 锁 = null; try { fs.unlinkSync(文件 + '.lock') } catch {} } }
  function 存盘(新) {
    核对数据(新)
    if (存储 !== null) {
      try { 存储.保存(拷贝(新)); 数据 = 新; return } catch { 故障 = 'TASK_STORE_WRITE_FAILED'; 失败(故障) }
    }
    if (文件 === null) { 数据 = 新; return }
    let 句柄 = null, 临时 = null
    try {
      if (已见文件 && !fs.existsSync(文件)) 失败('TASK_STORE_MISSING')
      const 原文 = JSON.stringify(新)
      if (Buffer.byteLength(原文) > 64 * 1024 * 1024) 失败('TASK_STORE_FULL')
      const 名 = 文件 + '.' + randomUUID() + '.tmp'
      句柄 = fs.openSync(名, 'wx', 0o600); 临时 = 名
      fs.writeFileSync(句柄, 原文, 'utf8'); fs.fsyncSync(句柄); fs.closeSync(句柄); 句柄 = null
      fs.renameSync(临时, 文件); 临时 = null; 已见文件 = true; 数据 = 新
    } catch { 故障 = 'TASK_STORE_WRITE_FAILED'; 失败(故障) }
    finally {
      if (句柄 !== null) { try { fs.closeSync(句柄) } catch {} }
      if (临时 !== null) { try { fs.unlinkSync(临时) } catch {} }
    }
  }
  function 记录事件(表, 事件, 一 = null, 代码 = 一?.代码 ?? null) {
    表.日志.push({ 于: 现在(), 事件, 任务: 一?.编号 ?? null, 代码, 尝试: 一?.尝试 ?? 0 })
    if (表.日志.length > 100) 表.日志.splice(0, 表.日志.length - 100)
  }
  function 改任务(键, 改动, 事件) {
    const 新 = 拷贝(数据), 一 = 新.记录.find((条) => 条.来源键 === 键)
    Object.assign(一, 改动, { 更新于: 现在() }); 记录事件(新, 事件, 一); 存盘(新)
  }
  function 本地未知(一) { return 契约.校验发送结果({ 版本: 1, 端点, 请求编号: 一.发送.请求编号, 状态: 'unknown', 渠道消息编号: null, 错误代码: 'DELIVERY_UNKNOWN', 可重试: false, 结束于: 现在() }) }
  try {
    if (存储 !== null) {
      try { const 已存 = 存储.读取(); if (已存 !== null) 数据 = 核对数据(已存) } catch { 失败('TASK_STORE_CORRUPT') }
    }
    if (文件 !== null) {
      fs.mkdirSync(path.dirname(文件), { recursive: true })
      try { 锁 = fs.openSync(文件 + '.lock', 'wx', 0o600) } catch (错) { 失败(错.code === 'EEXIST' ? 'TASK_STORE_BUSY' : 'TASK_STORE_UNAVAILABLE') }
      if (fs.existsSync(文件)) {
        已见文件 = true
        try {
          if (fs.statSync(文件).size > 64 * 1024 * 1024) 失败('TASK_DATA_INVALID')
          数据 = 核对数据(JSON.parse(fs.readFileSync(文件, 'utf8')))
        } catch { 失败('TASK_STORE_CORRUPT') }
      }
    }
    const 新 = 拷贝(数据)
    for (const 一 of 新.记录) {
      if (一.状态 === 'processing') { 一.状态 = 'interrupted'; 一.代码 = 'PROCESSING_INTERRUPTED'; 一.更新于 = 现在(); 记录事件(新, 'interrupted', 一) }
      if (一.状态 === 'sending') { 一.状态 = 'unknown'; 一.代码 = 'DELIVERY_UNKNOWN'; 一.回执 = 本地未知(一); 一.更新于 = 现在(); 记录事件(新, 'unknown', 一) }
    }
    存盘(新)
  } catch (错) { 释放锁(); 存储?.关闭(); throw new Error(['TASK_STORE_BUSY', 'TASK_STORE_UNAVAILABLE', 'TASK_STORE_CORRUPT', 'TASK_STORE_WRITE_FAILED'].includes(错.message) ? 错.message : 'TASK_STORE_UNAVAILABLE') }

  if (存储 !== null) 已挂接存储.add(存储)
  function 可运行() { if (已关闭) 失败('TASK_CLOSED'); if (故障) 失败(故障) }
  async function 排空() {
    let 发送数 = 0
    for (const 原 of 数据.记录.slice()) {
      if (已关闭 || 故障) break
      const 一 = 数据.记录.find((条) => 条.来源键 === 原.来源键)
      if (一.状态 !== 'queued') continue
      const 时刻 = 现在(), 键 = 一.来源键
      if (一.尝试 >= 最大尝试) { 改任务(键, { 状态: 'failed', 代码: 'RETRY_EXHAUSTED', 下次尝试于: null }, 'failed'); 许可们.delete(键); continue }
      if (一.发送.截止于 <= 时刻) { 改任务(键, { 状态: 'expired', 代码: 'EXPIRED', 下次尝试于: null }, 'expired'); 许可们.delete(键); continue }
      if (数据.记录.some((条) => 条.内部对话编号 === 一.内部对话编号 && ['processing', 'queued', 'sending'].includes(条.状态) && 数据.记录.indexOf(条) < 数据.记录.indexOf(一))) continue
      const 许可 = 许可们.get(键)
      if (!许可) continue // 重启不能从存档补发许可，等待真实适配器重放来源。
      const 判定 = 权限.审查发送(一.发送, 许可)
      if (!判定.允许) {
        if (判定.代码 === 'REPLY_CONTEXT_INVALID') { 许可们.delete(键); continue }
        改任务(键, { 状态: 'blocked', 代码: 'FORBIDDEN', 下次尝试于: null }, 'blocked'); 许可们.delete(键); continue
      }
      if (一.下次尝试于 > 时刻) continue
      if (数据.最近发送于 !== null && Date.parse(时刻) < Date.parse(数据.最近发送于) + 最小间隔毫秒) break
      const 新 = 拷贝(数据), 待发 = 新.记录.find((条) => 条.来源键 === 键)
      待发.状态 = 'sending'; 待发.尝试++; 待发.回执 = null; 待发.下次尝试于 = null; 待发.代码 = null; 待发.更新于 = 时刻; 新.最近发送于 = 时刻
      记录事件(新, 'sending', 待发); 存盘(新) // 先持久化sending，崩溃不能当作未发送自动重试。
      let 回执
      try {
        回执 = 契约.校验发送结果(await 守卫.发送(拷贝(待发.发送), { ...许可, 中止: 中止.signal }))
        if (!同端点(回执.端点) || 回执.请求编号 !== 待发.发送.请求编号) 失败('TASK_RECEIPT_INVALID')
      } catch { 回执 = 本地未知(待发) }
      if (已关闭 || 故障) break
      发送数++
      const 可再试 = 回执.状态 === 'failed' && 回执.可重试 && 待发.尝试 < 最大尝试
      const 下次 = 可再试 ? new Date(Date.parse(现在()) + 重试延迟毫秒 * (2 ** (待发.尝试 - 1))).toISOString() : null
      改任务(键, { 状态: 可再试 ? 'queued' : 回执.状态, 代码: 回执.错误代码, 回执, 下次尝试于: 下次 }, 可再试 ? 'retry' : 回执.状态)
      if (!可再试) 许可们.delete(键)
    }
    return { 好: !故障 && !已关闭, 发送数 }
  }
  function 推进() {
    try { 可运行() } catch (错) { return Promise.reject(错) }
    if (泵) { 再推进 = true; return 泵 }
    泵 = (async () => {
      let 发送数 = 0
      do { 再推进 = false; 发送数 += (await 排空()).发送数 } while (再推进 && !已关闭 && !故障)
      return { 好: !已关闭 && !故障, 发送数 }
    })().catch(() => { 故障 ||= 'TASK_RUNTIME_FAILED'; throw new Error(故障) }).finally(() => { 泵 = null })
    return 泵
  }
  async function 接受(输入, 上下文) {
    可运行()
    const 消息 = 契约.校验接收消息(输入)
    if (!同端点(消息.端点) || !权限.核对接收许可(消息, 上下文).允许) return
    const 键 = 哈希(契约.接收去重键(消息)), 指纹 = 输入指纹(消息), 已有 = 数据.记录.find((一) => 一.来源键 === 键)
    if (!已有 && 数据.记录.length >= 最大记录数) 失败('TASK_CAPACITY_REACHED')
    const 路由 = 映射.解析接收(消息, 上下文)
    if (!路由.好) 失败('TASK_MAPPING_FAILED')
    if (已有) {
      const 新 = 拷贝(数据), 一 = 新.记录.find((条) => 条.来源键 === 键)
      if (一.输入指纹 !== 指纹 || 一.内部对话编号 !== 路由.内部对话编号) {
        if (一.状态 === 'queued') { 一.状态 = 'blocked'; 一.代码 = 'MESSAGE_CONFLICT'; 一.下次尝试于 = null; 许可们.delete(键) }
        记录事件(新, 'conflict', 一, 'MESSAGE_CONFLICT'); 存盘(新); return
      }
      记录事件(新, 'duplicate', 一); 存盘(新)
      if (一.状态 === 'queued') 许可们.set(键, 上下文)
      await 推进(); return
    }
    const 时刻 = 现在(), 新 = 拷贝(数据)
    const 一 = { 编号: 'task-' + randomUUID(), 来源键: 键, 输入指纹: 指纹, 来源: { 端点: 消息.端点, 会话: 消息.会话, 发送者编号: 消息.发送者编号, 消息编号: 消息.消息编号 }, 内部对话编号: 路由.内部对话编号, 状态: 'processing', 发送: null, 尝试: 0, 下次尝试于: null, 代码: null, 创建于: 时刻, 更新于: 时刻, 回执: null }
    新.记录.push(一); 记录事件(新, 'received', 一); 存盘(新); 许可们.set(键, 上下文)
    const 本次 = 核心链.then(async () => {
      if (已关闭 || 故障) return
      if (!权限.核对接收许可(消息, 上下文).允许) { 改任务(键, { 状态: 'blocked', 代码: 'FORBIDDEN' }, 'blocked'); 许可们.delete(键); return }
      let 草稿
      const 本次中止 = new AbortController(); 核心中止们.add(本次中止)
      try { 草稿 = await 处理(拷贝(消息), Object.freeze({ 内部对话编号: 路由.内部对话编号, 中止: 本次中止.signal })) }
      catch { if (!已关闭 && !故障) { 改任务(键, { 状态: 'failed', 代码: 'PROCESSING_FAILED' }, 'failed'); 许可们.delete(键) }; return }
      finally { 核心中止们.delete(本次中止) }
      if (已关闭 || 故障) return
      if (!权限.核对接收许可(消息, 上下文).允许) { 改任务(键, { 状态: 'blocked', 代码: 'FORBIDDEN' }, 'blocked'); 许可们.delete(键); return }
      if (Date.parse(现在()) >= Date.parse(一.创建于) + 任务有效毫秒) { 改任务(键, { 状态: 'failed', 代码: 'EXPIRED' }, 'failed'); 许可们.delete(键); return }
      let 发送
      try {
        严格键(草稿, ['可见性', '正文', '附件'])
        发送 = 契约.校验发送消息({ 版本: 1, 端点: 消息.端点, 会话: 消息.会话, 接收者编号: 消息.发送者编号, 请求编号: 'c15-' + 键, 用途: 'reply', 回复消息编号: 消息.消息编号, 创建于: 现在(), 截止于: new Date(Date.parse(一.创建于) + 任务有效毫秒).toISOString(), 可见性: 草稿.可见性, 正文: 草稿.正文, 附件: 草稿.附件 })
      } catch { 改任务(键, { 状态: 'failed', 代码: 'INVALID_DRAFT' }, 'failed'); 许可们.delete(键); return }
      改任务(键, { 状态: 'queued', 发送, 下次尝试于: 现在() }, 'queued')
    })
    核心链 = 本次.catch(() => { 故障 ||= 'TASK_RUNTIME_FAILED' })
    try { await 本次; if (!已关闭 && !故障) await 推进() } catch { 失败(故障 || 'TASK_RUNTIME_FAILED') }
  }
  function 启动() {
    可运行()
    if (退订) return
    if (已挂接守卫.has(守卫)) 失败('TASK_GUARD_IN_USE')
    退订 = 守卫.订阅接收(接受); 已挂接守卫.add(守卫)
  }
  try { 退权限 = 权限.订阅变更(() => {
    if (已关闭 || 故障) return
    许可们.clear()
    for (const 一 of 核心中止们) 一.abort()
    const 新 = 拷贝(数据)
    for (const 一 of 新.记录) if (一.状态 === 'queued') { 一.状态 = 'blocked'; 一.代码 = 'FORBIDDEN'; 一.下次尝试于 = null; 一.更新于 = 现在(); 记录事件(新, 'blocked', 一) }
    try { 存盘(新) } catch { 故障 ||= 'TASK_STORE_WRITE_FAILED' }
  }) } catch { 释放锁(); if (存储) 已挂接存储.delete(存储); 存储?.关闭(); 失败('TASK_POLICY_CLOSED') }
  function 关闭() {
    if (已关闭) return
    已关闭 = true
    if (退订) { 退订(); 已挂接守卫.delete(守卫) }; if (退权限) 退权限(); 中止.abort(); 许可们.clear()
    for (const 一 of 核心中止们) 一.abort()
    try {
      if (!故障) {
        const 新 = 拷贝(数据)
        for (const 一 of 新.记录) {
          if (一.状态 === 'processing') { 一.状态 = 'interrupted'; 一.代码 = 'PROCESSING_INTERRUPTED'; 一.更新于 = 现在(); 记录事件(新, 'interrupted', 一) }
          if (一.状态 === 'sending') { 一.状态 = 'unknown'; 一.代码 = 'DELIVERY_UNKNOWN'; 一.回执 = 本地未知(一); 一.更新于 = 现在(); 记录事件(新, 'unknown', 一) }
        }
        存盘(新)
      }
    } finally { 释放锁(); if (存储) 已挂接存储.delete(存储); 存储?.关闭() }
  }
  return Object.freeze({ 启动, 推进, 关闭,
    取状态: () => ({ 已关闭, 故障, 持久化: 文件 !== null || 存储 !== null, 总任务: 数据.记录.length, 状态数: Object.fromEntries(状态们.map((状态) => [状态, 数据.记录.filter((一) => 一.状态 === 状态).length])) }),
    取任务状态: () => 数据.记录.map(({ 编号, 状态, 尝试, 代码, 下次尝试于 }) => ({ 编号, 状态, 尝试, 代码, 下次尝试于 })),
    取日志: () => 拷贝(数据.日志),
  })
}

module.exports = { 创建渠道任务调度 }
