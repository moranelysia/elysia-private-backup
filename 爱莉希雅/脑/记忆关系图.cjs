/**
 * 长期记忆关系图：记忆正文仍留在原来的三份文件里，这里只保存人工确认的关系。
 * 卡片位置与视口属于界面偏好，单独写进缓存；读图不会创建或改写任何文件。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 长期记忆 = require('./记忆.cjs')
const 时间线 = require('./记忆时间线候选.cjs')

const 关系类型们 = Object.freeze(['同一主题', '后续发展', '更新', '矛盾', '先于', '后于'])
const 无向关系 = new Set(['同一主题', '矛盾'])
const 默认关系文件 = path.join(配置.数据目录, '关系图.json')
const 默认布局文件 = path.join(配置.缓存目录, '长期记忆关系图布局.json')

function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }
function 节点键(类别, 编号) { return `${String(类别 || '').trim()}:${String(编号 || '').trim()}` }
function 深拷贝(值) { return JSON.parse(JSON.stringify(值)) }
function 新编号() { return `relation-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}` }
function 有限数(值, 回退 = 0) { const 数 = Number(值); return Number.isFinite(数) ? 数 : 回退 }
function 限制(值, 最小, 最大) { return Math.max(最小, Math.min(最大, 有限数(值))) }

function 原子写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = `${文件}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(临时, JSON.stringify(数据, null, 2) + '\n', 'utf8')
    fs.renameSync(临时, 文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 读JSON(文件, 回退) {
  try {
    const 值 = JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, ''))
    return 是对象(值) ? 值 : 回退
  } catch (错误) {
    if (错误.code === 'ENOENT') return 回退
    throw new Error(`${path.basename(文件)} 读不出来：${错误.message}`)
  }
}

function 规范端点(值) {
  const 类别 = String(值 && 值.类别 || '').trim()
  const 编号 = String(值 && 值.编号 || '').trim()
  return { 类别, 编号, 键: 节点键(类别, 编号) }
}

function 规范关系(原) {
  if (!是对象(原)) return null
  const 从 = 规范端点(原.从)
  const 到 = 规范端点(原.到)
  const 类型 = String(原.类型 || '').trim()
  if (!原.编号 || !关系类型们.includes(类型) || !从.类别 || !从.编号 || !到.类别 || !到.编号 || 从.键 === 到.键) return null
  return {
    编号: String(原.编号).slice(0, 120), 类型,
    从: { 类别: 从.类别, 编号: 从.编号 }, 到: { 类别: 到.类别, 编号: 到.编号 },
    创建于: String(原.创建于 || ''), 修改于: String(原.修改于 || ''), 来源: '人工确认',
  }
}

function 关系签名(类型, 从, 到) {
  let 起 = 节点键(从.类别, 从.编号), 终 = 节点键(到.类别, 到.编号)
  if (无向关系.has(类型) && 起 > 终) [起, 终] = [终, 起]
  return `${类型}|${起}|${终}`
}

function 创建关系图库({
  关系文件 = 默认关系文件,
  布局文件 = 默认布局文件,
  长期记忆库 = 长期记忆,
  现在 = () => new Date(),
  造编号 = 新编号,
} = {}) {
  const 关系路径 = path.resolve(关系文件)
  const 布局路径 = path.resolve(布局文件)

  function 读关系数据() {
    const 原 = 读JSON(关系路径, { 格式版本: 1, 关系: [] })
    return { 格式版本: 1, 更新于: String(原.更新于 || ''), 关系: (Array.isArray(原.关系) ? 原.关系 : []).map(规范关系).filter(Boolean) }
  }

  function 读布局数据() {
    const 原 = 读JSON(布局路径, { 格式版本: 1, 节点: {}, 视图: { x: 18, y: 18, 缩放: 0.82 } })
    const 节点 = {}
    if (是对象(原.节点)) for (const [键, 值] of Object.entries(原.节点).slice(0, 1000)) {
      if (!是对象(值)) continue
      节点[String(键).slice(0, 260)] = { x: 限制(值.x, -20000, 20000), y: 限制(值.y, -20000, 20000) }
    }
    const 原视图 = 是对象(原.视图) ? 原.视图 : {}
    return { 格式版本: 1, 节点, 视图: {
      x: 限制(原视图.x === undefined ? 18 : 原视图.x, -20000, 20000),
      y: 限制(原视图.y === undefined ? 18 : 原视图.y, -20000, 20000),
      缩放: 限制(原视图.缩放 === undefined ? 0.82 : 原视图.缩放, 0.35, 2),
    } }
  }

  function 当前节点() {
    const 原 = 长期记忆库.全部长期记忆().filter((一) => 一 && 一.编号 && 一.内容)
    return 原.map((一, 顺序) => {
      const 线 = 时间线.统一记录(一, '长期记忆', 顺序) || {}
      return {
        键: 节点键(一.类别, 一.编号), 编号: String(一.编号), 类别: String(一.类别 || ''),
        内容: String(一.内容 || '').slice(0, 2000), 时间: String(一.时间 || ''),
        记忆类型: String(一.记忆类型 || ''), 人物: String(一.元数据 && 一.元数据.person || ''),
        关系语境: String(一.元数据 && 一.元数据.relationship || ''),
        事件时间: 线.事件时间 || { 状态: '未知', 排序键: '' },
      }
    })
  }

  function 查询({ 类别 = '', 搜索 = '' } = {}) {
    const 类 = ['事实', '经历', '小本子'].includes(String(类别)) ? String(类别) : ''
    const 词 = String(搜索 || '').trim().toLocaleLowerCase().slice(0, 80)
    const 全部节点 = 当前节点()
    const 可用 = new Map(全部节点.map((一) => [一.键, 一]))
    const 节点 = 全部节点.filter((一) => (!类 || 一.类别 === 类) && (!词 || `${一.内容}\n${一.类别}\n${一.记忆类型}\n${一.人物}\n${一.关系语境}`.toLocaleLowerCase().includes(词)))
    const 显示键 = new Set(节点.map((一) => 一.键))
    const 数据 = 读关系数据()
    const 有效关系 = []
    let 失效关系数 = 0
    for (const 一 of 数据.关系) {
      const 从键 = 节点键(一.从.类别, 一.从.编号), 到键 = 节点键(一.到.类别, 一.到.编号)
      if (!可用.has(从键) || !可用.has(到键)) { 失效关系数++; continue }
      if (显示键.has(从键) && 显示键.has(到键)) 有效关系.push({ ...一, 从键, 到键 })
    }

    // 候选只展示，不落盘。只有用户点“采纳”后才进入正式关系文件。
    const 已存签名 = new Set(数据.关系.map((一) => 关系签名(一.类型, 一.从, 一.到)))
    const 时间记录 = 全部节点.map((一, 顺序) => 时间线.统一记录({ ...可用.get(一.键), 元数据: { person: 一.人物, relationship: 一.关系语境 } }, '长期记忆', 顺序)).filter(Boolean)
    const 编号到节点 = new Map()
    for (const 一 of 全部节点) {
      const 表 = 编号到节点.get(一.编号) || []
      表.push(一); 编号到节点.set(一.编号, 表)
    }
    const 候选关系 = []
    for (const 候选 of 时间线.关系候选(时间记录)) {
      const 从列 = 编号到节点.get(String(候选.从编号)) || [], 到列 = 编号到节点.get(String(候选.到编号)) || []
      if (从列.length !== 1 || 到列.length !== 1) continue
      const 从 = 从列[0], 到 = 到列[0]
      if (!显示键.has(从.键) || !显示键.has(到.键)) continue
      const 签名 = 关系签名(候选.类型, 从, 到)
      if (已存签名.has(签名)) continue
      候选关系.push({ 编号: String(候选.编号), 类型: 候选.类型, 从: { 类别: 从.类别, 编号: 从.编号 }, 到: { 类别: 到.类别, 编号: 到.编号 }, 从键: 从.键, 到键: 到.键, 置信度: 候选.置信度, 依据: String(候选.依据 || '').slice(0, 300), 候选: true })
      if (候选关系.length >= 80) break
    }
    const 布局 = 读布局数据()
    return { 好: true, 节点, 关系: 有效关系, 候选关系, 布局, 总数: 节点.length, 关系总数: 有效关系.length, 候选总数: 候选关系.length, 失效关系数 }
  }

  function 端点存在(端点) {
    const 规范 = 规范端点(端点)
    const 存在 = 当前节点().some((一) => 一.键 === 规范.键)
    return 存在 ? 规范 : null
  }

  function 新增({ 类型, 从, 到 } = {}) {
    类型 = String(类型 || '').trim()
    if (!关系类型们.includes(类型)) return { 好: false, 说明: '关系类型不对' }
    const 起 = 端点存在(从), 终 = 端点存在(到)
    if (!起 || !终) return { 好: false, 说明: '关系两端必须是仍然存在的长期记忆' }
    if (起.键 === 终.键) return { 好: false, 说明: '一条记忆不能连接自己' }
    const 数据 = 读关系数据()
    const 签名 = 关系签名(类型, 起, 终)
    const 已有 = 数据.关系.find((一) => 关系签名(一.类型, 一.从, 一.到) === 签名)
    if (已有) return { 好: true, 没变化: true, 关系: 深拷贝(已有) }
    const 时间 = new Date(现在()).toISOString()
    const 关系 = { 编号: String(造编号()).slice(0, 120), 类型, 从: { 类别: 起.类别, 编号: 起.编号 }, 到: { 类别: 终.类别, 编号: 终.编号 }, 创建于: 时间, 修改于: 时间, 来源: '人工确认' }
    数据.关系.push(关系); 数据.更新于 = 时间
    原子写JSON(关系路径, 数据)
    return { 好: true, 关系: 深拷贝(关系) }
  }

  function 修改({ 编号, 类型 } = {}) {
    编号 = String(编号 || '').trim(); 类型 = String(类型 || '').trim()
    if (!编号) return { 好: false, 说明: '关系编号不能为空' }
    if (!关系类型们.includes(类型)) return { 好: false, 说明: '关系类型不对' }
    const 数据 = 读关系数据(), 关系 = 数据.关系.find((一) => 一.编号 === 编号)
    if (!关系) return { 好: false, 说明: '这条关系已经不存在' }
    if (关系.类型 === 类型) return { 好: true, 没变化: true, 关系: 深拷贝(关系) }
    const 签名 = 关系签名(类型, 关系.从, 关系.到)
    if (数据.关系.some((一) => 一.编号 !== 编号 && 关系签名(一.类型, 一.从, 一.到) === 签名)) return { 好: false, 说明: '相同关系已经存在' }
    关系.类型 = 类型; 关系.修改于 = new Date(现在()).toISOString(); 数据.更新于 = 关系.修改于
    原子写JSON(关系路径, 数据)
    return { 好: true, 关系: 深拷贝(关系) }
  }

  function 删除(编号) {
    编号 = String(编号 || '').trim()
    if (!编号) return { 好: false, 说明: '关系编号不能为空' }
    const 数据 = 读关系数据(), 原数 = 数据.关系.length
    数据.关系 = 数据.关系.filter((一) => 一.编号 !== 编号)
    if (数据.关系.length === 原数) return { 好: false, 说明: '这条关系已经不存在' }
    数据.更新于 = new Date(现在()).toISOString(); 原子写JSON(关系路径, 数据)
    return { 好: true }
  }

  function 保存布局({ 节点, 视图 } = {}) {
    const 可用 = new Set(当前节点().map((一) => 一.键))
    const 安全节点 = {}
    const 旧布局 = 读布局数据()
    for (const [键, 值] of Object.entries(旧布局.节点)) if (可用.has(键)) 安全节点[键] = 值
    if (是对象(节点)) for (const [键, 值] of Object.entries(节点).slice(0, 1000)) {
      if (!可用.has(键) || !是对象(值)) continue
      安全节点[键] = { x: 限制(值.x, -20000, 20000), y: 限制(值.y, -20000, 20000) }
    }
    const 安全视图 = { x: 限制(视图 && 视图.x, -20000, 20000), y: 限制(视图 && 视图.y, -20000, 20000), 缩放: 限制(视图 && 视图.缩放 || 1, 0.35, 2) }
    原子写JSON(布局路径, { 格式版本: 1, 更新于: new Date(现在()).toISOString(), 节点: 安全节点, 视图: 安全视图 })
    return { 好: true, 节点数: Object.keys(安全节点).length }
  }

  return { 查询, 新增, 修改, 删除, 保存布局, 关系文件: 关系路径, 布局文件: 布局路径 }
}

const 默认库 = 创建关系图库()
module.exports = { 关系类型们, 节点键, 创建关系图库, ...默认库 }
