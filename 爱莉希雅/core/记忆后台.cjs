/** Node后台只调用现有模块的直接入口，不启动它们的桌面队列/周期计时器。 */
'use strict'
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto')
const { 创建后台任务 } = require('./后台任务.cjs')
function 创建记忆后台({ 所有者, 配置, 模型连接, 检查写入, 设置 = {}, 现在 = () => new Date(), 设延时, 清延时 } = {}) {
  const 名字们 = ['diary', 'private', 'relations', 'clusters', 'facts', 'extract']
  if (!设置 || Object.keys(设置).some((键) => !名字们.includes(键) || typeof 设置[键] !== 'boolean') || 设置.private) throw new Error('BACKGROUND_POLICY_INVALID')
  // private生产开关仍关闭；同一任务管理器支持它的直接入口，但本步不复制或启用正式private。
  const 毫秒 = () => new Date(现在()).getTime(), 任务们 = [], 文件 = path.join(配置.缓存目录, '后台缓冲.json')
  let 缓冲 = [], 管理器, 已见缓冲 = false
  function 读缓冲() {
    检查写入()
    try {
      if (fs.statSync(文件).size > 4 * 1024 * 1024) throw new Error('BACKGROUND_BUFFER_INVALID')
      const 包 = JSON.parse(fs.readFileSync(文件, 'utf8'))
      if (包.版本 !== 1 || !Array.isArray(包.轮次) || 包.轮次.length > 100 || 包.轮次.some((一) => !一 || !/^channel-[a-zA-Z0-9_-]+$/u.test(一.对话) || typeof 一.消息编号 !== 'string' || typeof 一.用户原话 !== 'string' || 一.用户原话.length > 6000 || typeof 一.她的回复 !== 'string' || 一.她的回复.length > 6000 || !Number.isFinite(Date.parse(一.接收于)) || !Number.isFinite(Date.parse(一.消息时间)))) throw new Error('BACKGROUND_BUFFER_INVALID')
      已见缓冲 = true; return 包.轮次
    } catch (错) { if (错.code === 'ENOENT' && !已见缓冲) return []; throw new Error('BACKGROUND_BUFFER_INVALID') }
  }
  function 存缓冲(新) {
    检查写入(); fs.mkdirSync(path.dirname(文件), { recursive: true }); const 临时 = 文件 + '.' + randomUUID() + '.tmp'
    try { fs.writeFileSync(临时, JSON.stringify({ 版本: 1, 轮次: 新 }), { flag: 'wx', encoding: 'utf8' }); fs.renameSync(临时, 文件); 已见缓冲 = true; 缓冲 = 新 }
    finally { try { fs.unlinkSync(临时) } catch { /* 不删除旧档 */ } }
  }
  const 通知 = ({ 长期变化 = false, 临时变化 = false } = {}) => {
    if (长期变化) { 管理器.通知('relations'); 管理器.通知('clusters') }
    else if (临时变化) 管理器.通知('clusters')
  }
  const 连接 = (上下文) => ({ ...上下文, 钥匙: 'injected-transport-only', 地址: 'https://api.deepseek.com/chat/completions', 模型: 模型连接.模型 || 'fake', 通知,
    fetch函数: async (_地址, 请求) => {
      const 果 = await 模型连接.要一轮({ 消息们: JSON.parse(请求.body).messages, 中止: 请求.signal })
      return new Response(JSON.stringify({ choices: [{ message: { content: 果.全文 } }] }), { headers: { 'content-type': 'application/json' } })
    },
  })
  function 加(名字, 首次, 间隔, 执行, 仅通知 = false, 参数 = {}) { if (设置[名字]) 任务们.push({ 名字, 首次, 间隔, 执行, 仅通知, ...参数 }) }
  if (设置.diary) {
    const 日记 = require('../脑/记忆日记.cjs').创建日记系统({ 数据目录: 配置.数据目录, 现在 })
    加('diary', 15000, 900000, (上下文) => { 上下文.检查写入(); 日记.安排(); return 日记.执行待办(连接(上下文), 1) })
  }
  if (设置.relations) {
    const 关系 = require('../脑/记忆关系整理.cjs').创建整理器({ 状态文件: path.join(配置.数据目录, '关系整理状态.json'), 现在 })
    加('relations', 30000, 1800000, (上下文) => 关系.整理一次({ ...上下文, 原因: 'Node生命周期' }), false, { 防抖: 45000, 最小间隔: 600000 })
  }
  if (设置.clusters) {
    const 聚类 = require('../脑/记忆聚类就绪.cjs').创建检查器({ 现在 })
    加('clusters', 45000, 1800000, (上下文) => 聚类.检查一次({ ...上下文, 原因: 'Node生命周期' }), false, { 防抖: 60000, 最小间隔: 600000 })
  }
  if (设置.facts) 加('facts', 0, 1, (上下文) => require('../脑/记忆整理.cjs').整理一次(连接(上下文)), true)
  let 提取
  function 安排提取() {
    if (!缓冲.length || !设置.extract) return
    const 分组 = Map.groupBy(缓冲, (一) => 一.对话)
    const 延迟 = Math.min(...[...分组.values()].map((组) => 组.length >= 3 ? 0 : Math.max(0, Date.parse(组[0].接收于) + 300000 - 毫秒())))
    管理器.通知('extract', { 延迟: Math.min(86400000, Math.ceil(延迟)) })
  }
  if (设置.extract) {
    缓冲 = 读缓冲(); 提取 = require('../脑/临时记忆提取.cjs').创建提取器()
    加('extract', 0, 1, async (上下文) => {
      // 本轮完成前新来的轮次保留；只移除本批消息归属，不覆盖并发追加。
      const 分组 = Map.groupBy(缓冲, (一) => 一.对话)
      for (const [对话, 组] of 分组) {
        if (组.length < 3 && Date.parse(组[0].接收于) + 300000 > 毫秒()) continue
        const 批 = 组.slice(0, 3)
        await 提取.提取批次({ ...连接(上下文), 对话, 对话轮次: 批 })
        上下文.检查写入(); const 键 = new Set(批.map((一) => JSON.stringify([一.对话, 一.消息编号])))
        存缓冲(缓冲.filter((一) => !键.has(JSON.stringify([一.对话, 一.消息编号]))))
      }
      安排提取()
    }, true)
  }
  管理器 = 创建后台任务({ 所有者, 任务们, 检查写入, 现在: 毫秒, 设延时, 清延时 })
  安排提取()
  return Object.freeze({ ...管理器, 通知变化: 通知,
    记录轮次(一) {
      if (!设置.extract) return
      检查写入()
      if (缓冲.some((旧) => 旧.对话 === 一.对话 && 旧.消息编号 === 一.消息编号)) return
      if (缓冲.length >= 100) throw new Error('BACKGROUND_BUFFER_FULL')
      存缓冲([...缓冲, { 对话: 一.对话, 消息编号: 一.消息编号, 用户原话: String(一.用户原话).slice(0, 6000), 她的回复: String(一.她的回复).slice(0, 6000), 消息时间: 一.发生于 || 一.接收于, 接收于: 一.接收于 }]); 安排提取()
    },
    取状态: () => ({ ...管理器.取状态(), 待提取轮数: 缓冲.length, private: false }),
  })
}
module.exports = { 创建记忆后台 }
