/**
 * 长期记忆关系图：记忆正文仍留在原来的三份文件里，这里只保存关系及其可解释来源。
 * 卡片位置与视口属于界面偏好，单独写进缓存；读图不会创建或改写任何文件。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 长期记忆 = require('./记忆.cjs')
const 时间线 = require('./记忆时间线候选.cjs')
const 记忆叙述 = require('./记忆叙述.cjs')

const 关系类型们 = Object.freeze(['同一主题', '后续发展', '更新', '矛盾', '先于', '后于'])
const 自动关系类型们 = Object.freeze(['同一主题', '后续发展', '先于'])
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
  const 来源 = ['自动整理', '人工确认'].includes(String(原.来源 || '')) ? String(原.来源) : '人工确认'
  const 自动依据原 = 是对象(原.自动依据) ? 原.自动依据 : {}
  const 自动依据 = 来源 === '自动整理' ? {
    规则版本: String(自动依据原.规则版本 || '').slice(0, 80),
    候选编号: String(自动依据原.候选编号 || '').slice(0, 120),
    置信度: 限制(自动依据原.置信度, 0, 1),
    关联置信度: 限制(自动依据原.关联置信度 === undefined ? 自动依据原.置信度 : 自动依据原.关联置信度, 0, 1),
    依据: String(自动依据原.依据 || '').slice(0, 300),
    输入指纹: String(自动依据原.输入指纹 || '').slice(0, 128),
    评估于: String(自动依据原.评估于 || '').slice(0, 80),
  } : undefined
  return {
    编号: String(原.编号).slice(0, 120), 类型,
    从: { 类别: 从.类别, 编号: 从.编号 }, 到: { 类别: 到.类别, 编号: 到.编号 },
    创建于: String(原.创建于 || ''), 修改于: String(原.修改于 || ''), 来源,
    ...(自动依据 ? { 自动依据 } : {}),
  }
}

function 规范抑制(原) {
  if (!是对象(原)) return null
  const 签名 = String(原.签名 || '').trim().slice(0, 520)
  if (!签名) return null
  return { 签名, 原因: String(原.原因 || '用户删除关系').slice(0, 80), 时间: String(原.时间 || '').slice(0, 80) }
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
    const 原 = 读JSON(关系路径, { 格式版本: 2, 关系: [], 自动抑制: [] })
    return {
      格式版本: 2,
      更新于: String(原.更新于 || ''),
      关系: (Array.isArray(原.关系) ? 原.关系 : []).map(规范关系).filter(Boolean),
      自动抑制: (Array.isArray(原.自动抑制) ? 原.自动抑制 : []).map(规范抑制).filter(Boolean).slice(-500),
    }
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
      const 元数据 = 记忆叙述.面向她的元数据(一.元数据 || {})
      return {
        键: 节点键(一.类别, 一.编号), 编号: String(一.编号), 类别: String(一.类别 || ''),
        内容: 记忆叙述.整理正文(一.内容, { 人物: 一.元数据 && 一.元数据.person, 修正旧代词: true }).slice(0, 2000), 时间: String(一.时间 || ''),
        记忆类型: String(一.记忆类型 || ''), 人物: String(元数据.person || ''),
        关系语境: String(元数据.relationship || ''),
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
    return {
      好: true, 节点, 关系: 有效关系, 候选关系, 布局, 总数: 节点.length,
      关系总数: 有效关系.length, 自动关系总数: 有效关系.filter((一) => 一.来源 === '自动整理').length,
      候选总数: 候选关系.length, 失效关系数,
    }
  }

  /**
   * 给聊天召回使用的只读窄入口：只返回“种子记忆”直接连着的已保存关系。
   *
   * 这里故意不调用 查询()：查询会现场生成候选边，而聊天只能使用已经落盘的正式关系。
   * 返回值也不会继续沿邻居展开，调用方拿不到二跳，更不可能把整张图塞进提示词。
   */
  function 读取已保存一跳({ 种子 = [] } = {}) {
    const 种子键 = new Set((Array.isArray(种子) ? 种子 : []).slice(0, 20).map((一) => {
      if (typeof 一 === 'string') return String(一).trim()
      return 规范端点(一).键
    }).filter(Boolean))
    const 结果 = { 好: true, 邻接: [], 检查关系数: 0, 失效关系数: 0 }
    if (!种子键.size) return 结果

    const 可用 = new Map(当前节点().map((一) => [一.键, 一]))
    const 数据 = 读关系数据()
    for (const 关系 of 数据.关系) {
      const 从键 = 节点键(关系.从.类别, 关系.从.编号)
      const 到键 = 节点键(关系.到.类别, 关系.到.编号)
      const 从节点 = 可用.get(从键), 到节点 = 可用.get(到键)
      if (!从节点 || !到节点) { 结果.失效关系数++; continue }
      const 从是种子 = 种子键.has(从键), 到是种子 = 种子键.has(到键)
      if (!从是种子 && !到是种子) continue
      结果.检查关系数++
      // 两端都已直接命中，不把其中一端伪装成“关系补充”。
      if (从是种子 && 到是种子) continue
      结果.邻接.push({
        种子: 深拷贝(从是种子 ? 从节点 : 到节点),
        邻居: 深拷贝(从是种子 ? 到节点 : 从节点),
        方向: 从是种子 ? '正向' : '反向',
        关系: 深拷贝(关系),
      })
    }
    return 结果
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
    if (已有) {
      if (已有.来源 === '自动整理') {
        已有.来源 = '人工确认'; 已有.修改于 = new Date(现在()).toISOString()
        数据.自动抑制 = 数据.自动抑制.filter((一) => 一.签名 !== 签名)
        数据.更新于 = 已有.修改于; 原子写JSON(关系路径, 数据)
        return { 好: true, 已人工确认: true, 关系: 深拷贝(已有) }
      }
      return { 好: true, 没变化: true, 关系: 深拷贝(已有) }
    }
    const 时间 = new Date(现在()).toISOString()
    const 关系 = { 编号: String(造编号()).slice(0, 120), 类型, 从: { 类别: 起.类别, 编号: 起.编号 }, 到: { 类别: 终.类别, 编号: 终.编号 }, 创建于: 时间, 修改于: 时间, 来源: '人工确认' }
    数据.自动抑制 = 数据.自动抑制.filter((一) => 一.签名 !== 签名)
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
    if (关系.类型 === 类型) {
      if (关系.来源 !== '自动整理') return { 好: true, 没变化: true, 关系: 深拷贝(关系) }
      关系.来源 = '人工确认'; 关系.修改于 = new Date(现在()).toISOString(); 数据.更新于 = 关系.修改于
      原子写JSON(关系路径, 数据)
      return { 好: true, 已人工确认: true, 关系: 深拷贝(关系) }
    }
    const 签名 = 关系签名(类型, 关系.从, 关系.到)
    if (数据.关系.some((一) => 一.编号 !== 编号 && 关系签名(一.类型, 一.从, 一.到) === 签名)) return { 好: false, 说明: '相同关系已经存在' }
    const 旧签名 = 关系签名(关系.类型, 关系.从, 关系.到)
    if (!数据.自动抑制.some((一) => 一.签名 === 旧签名)) 数据.自动抑制.push({ 签名: 旧签名, 原因: '用户修改关系', 时间: new Date(现在()).toISOString() })
    数据.自动抑制 = 数据.自动抑制.slice(-500)
    关系.类型 = 类型; 关系.来源 = '人工确认'; 关系.修改于 = new Date(现在()).toISOString(); 数据.更新于 = 关系.修改于
    原子写JSON(关系路径, 数据)
    return { 好: true, 关系: 深拷贝(关系) }
  }

  function 删除(编号) {
    编号 = String(编号 || '').trim()
    if (!编号) return { 好: false, 说明: '关系编号不能为空' }
    const 数据 = 读关系数据(), 原数 = 数据.关系.length
    const 要删 = 数据.关系.find((一) => 一.编号 === 编号)
    数据.关系 = 数据.关系.filter((一) => 一.编号 !== 编号)
    if (数据.关系.length === 原数) return { 好: false, 说明: '这条关系已经不存在' }
    const 时间 = new Date(现在()).toISOString()
    if (要删) {
      const 签名 = 关系签名(要删.类型, 要删.从, 要删.到)
      if (!数据.自动抑制.some((一) => 一.签名 === 签名)) 数据.自动抑制.push({ 签名, 原因: '用户删除关系', 时间 })
      数据.自动抑制 = 数据.自动抑制.slice(-500)
    }
    数据.更新于 = 时间; 原子写JSON(关系路径, 数据)
    return { 好: true }
  }

  /** 自动整理只接受本地规则已经证明安全的三类边，并在一次原子写入中完成。 */
  function 应用自动候选({ 候选们, 输入指纹 = '', 规则版本 = '' } = {}) {
    const 原候选 = Array.isArray(候选们) ? 候选们.slice(0, 20) : []
    const 节点 = new Map(当前节点().map((一) => [一.键, 一]))
    const 数据 = 读关系数据()
    const 已有签名 = new Set(数据.关系.map((一) => 关系签名(一.类型, 一.从, 一.到)))
    const 抑制签名 = new Set(数据.自动抑制.map((一) => 一.签名))
    const 新增们 = []
    const 时间 = new Date(现在()).toISOString()
    for (const 原 of 原候选) {
      const 类型 = String(原 && 原.类型 || '').trim()
      const 从 = 规范端点(原 && 原.从), 到 = 规范端点(原 && 原.到)
      const 置信度 = Number(原 && 原.置信度)
      const 关联置信度 = Number(原 && (原.关联置信度 === undefined ? 原.置信度 : 原.关联置信度))
      const 安全 = 类型 === '同一主题' ? 置信度 >= 0.92
        : 类型 === '后续发展' ? 置信度 >= 0.86
          : 类型 === '先于' ? 置信度 === 1 && 关联置信度 >= 0.86 : false
      if (!自动关系类型们.includes(类型) || !安全 || !节点.has(从.键) || !节点.has(到.键) || 从.键 === 到.键) continue
      const 签名 = 关系签名(类型, 从, 到)
      if (已有签名.has(签名) || 抑制签名.has(签名)) continue
      const 编号 = `auto-${crypto.createHash('sha256').update(签名).digest('hex').slice(0, 20)}`
      const 关系 = {
        编号, 类型, 从: { 类别: 从.类别, 编号: 从.编号 }, 到: { 类别: 到.类别, 编号: 到.编号 },
        创建于: 时间, 修改于: 时间, 来源: '自动整理',
        自动依据: {
          规则版本: String(规则版本 || '').slice(0, 80), 候选编号: String(原.候选编号 || '').slice(0, 120),
          置信度: 限制(置信度, 0, 1), 关联置信度: 限制(关联置信度, 0, 1),
          依据: String(原.依据 || '').slice(0, 300), 输入指纹: String(输入指纹 || '').slice(0, 128), 评估于: 时间,
        },
      }
      数据.关系.push(关系); 新增们.push(关系); 已有签名.add(签名)
    }
    if (!新增们.length) return { 好: true, 没变化: true, 新增数: 0, 关系: [] }
    数据.更新于 = 时间; 原子写JSON(关系路径, 数据)
    return { 好: true, 新增数: 新增们.length, 关系: 深拷贝(新增们) }
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

  return { 查询, 读取已保存一跳, 新增, 修改, 删除, 应用自动候选, 保存布局, 关系文件: 关系路径, 布局文件: 布局路径 }
}

const 默认库 = 创建关系图库()
module.exports = { 关系类型们, 自动关系类型们, 节点键, 创建关系图库, ...默认库 }
