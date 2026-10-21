/**
 * P2 第二层的只读最小实现：把相似记忆整理成“候选”，供人工检查。
 *
 * 这里故意不接入聊天召回，也不修改、归档或替换任何原始记忆。候选报告只写入缓存目录；
 * 摘要采用抽取式写法，避免在分组规则尚未验收前引入模型臆测。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 临时记忆 = require('./临时记忆.cjs')
const 长期记忆 = require('./记忆.cjs')
const 记忆结构 = require('./记忆结构.cjs')

const 默认相似阈值 = 0.55
const 默认最小组数 = 3
const 默认最大条数 = 500
const 默认输出文件 = path.join(配置.缓存目录, '记忆聚类候选.json')
const 停用片段 = new Set('什么 怎么 可以 这个 那个 一下 已经 还是 没有 就是 我的 你的 他的 她的 我们 你们 他们 时候 现在 今天 最近 之前 用户 本人'.split(' '))

function 是对象(值) {
  return !!值 && typeof 值 === 'object' && !Array.isArray(值)
}

function 文本指纹(值) {
  return crypto.createHash('sha256').update(String(值 || '')).digest('hex')
}

function 规整文本(值) {
  return String(值 || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

/** 中文按双字片段，英文和数字按完整词；仅用于本地候选分组。 */
function 特征们(值) {
  const 文 = 规整文本(值)
  const 结果 = new Set(文.match(/[a-z0-9_]{2,}/g) || [])
  for (const 段 of 文.match(/[\p{Script=Han}]+/gu) || []) {
    for (let i = 0; i < 段.length - 1; i++) {
      const 片段 = 段.slice(i, i + 2)
      if (!停用片段.has(片段)) 结果.add(片段)
    }
  }
  return [...结果].sort()
}

/** 包含度照顾一长一短的同义表述，Jaccard 防止短片段只靠一个词误命中。 */
function 相似度(甲, 乙) {
  const a = new Set(Array.isArray(甲) ? 甲 : 特征们(甲))
  const b = new Set(Array.isArray(乙) ? 乙 : 特征们(乙))
  if (!a.size || !b.size) return 0
  let 交 = 0
  for (const x of a) if (b.has(x)) 交++
  const 并 = a.size + b.size - 交
  const jaccard = 并 ? 交 / 并 : 0
  const 包含度 = 交 / Math.min(a.size, b.size)
  return Number((jaccard * 0.35 + 包含度 * 0.65).toFixed(4))
}

function 正常人物结构(记录) {
  const 结构 = 记忆结构.规范记忆结构(记录, 记录 && 记录.类别, 记录 && 记录.来源)
  return {
    记忆类型: 结构.记忆类型,
    person: 结构.元数据.person,
    relationship: 结构.元数据.relationship,
  }
}

function 统一记录(记录, 来源层, 顺序) {
  if (!是对象(记录)) return null
  const 内容 = String(记录.内容 || '').trim()
  if (!内容) return null
  const 人物 = 正常人物结构(记录)
  const 原编号 = String(记录.编号 || '').trim()
  const 稳定编号 = 原编号 || 文本指纹(`${来源层}\n${记录.类别 || ''}\n${记录.时间 || 记录.创建于 || ''}\n${内容}`).slice(0, 20)
  return {
    键: `${来源层}:${记录.类别 || ''}:${稳定编号}`,
    来源层,
    编号: 稳定编号,
    类别: String(记录.类别 || ''),
    记忆类型: 人物.记忆类型,
    person: 人物.person,
    relationship: 人物.relationship,
    内容,
    时间: String(记录.更新于 || 记录.时间 || 记录.创建于 || ''),
    特征: 特征们(内容),
    顺序,
  }
}

function 读取可聚类记忆({ 临时记忆库 = 临时记忆, 长期记忆库 = 长期记忆, 现在 = () => new Date(), 最大条数 = 默认最大条数 } = {}) {
  const 当前时刻 = new Date(现在()).getTime()
  const 临时原 = 临时记忆库.查询({ 生命周期: '有效', 确认状态: '已确认', 限量: 1000 }).列表
  const 临时 = 临时原.filter((一) => 一 && 一.生命周期 === '有效' && 一.确认状态 === '已确认' &&
    (!一.关系 || 一.关系.状态 === '当前') && (!一.到期于 || Date.parse(一.到期于) > 当前时刻))
  const 长期 = 长期记忆库.全部长期记忆()
  const 全部 = [
    ...临时.map((一, i) => 统一记录(一, '临时记忆', i)),
    ...长期.map((一, i) => 统一记录(一, '长期记忆', 临时.length + i)),
  ].filter(Boolean)

  // 新记录优先；相同时间时保持稳定键排序。最大条数让这个审查工具不会随数据无限变慢。
  全部.sort((a, b) => String(b.时间).localeCompare(String(a.时间)) || a.键.localeCompare(b.键))
  const 去重 = []
  const 已见 = new Set()
  for (const 一 of 全部) {
    if (已见.has(一.键)) continue
    已见.add(一.键)
    去重.push(一)
  }
  const 上限 = Math.max(3, Math.min(2000, Number(最大条数) || 默认最大条数))
  return { 记录: 去重.slice(0, 上限), 原始数量: 全部.length, 截断数量: Math.max(0, 去重.length - 上限) }
}

function 可同组(甲, 乙) {
  return 甲.记忆类型 === 乙.记忆类型 && 甲.person === 乙.person && 甲.relationship === 乙.relationship
}

function 聚类(记录们, { 相似阈值 = 默认相似阈值, 最小组数 = 默认最小组数 } = {}) {
  const 阈值 = Number(相似阈值)
  const 最小 = Number(最小组数)
  if (!(阈值 > 0 && 阈值 <= 1)) throw new Error('相似阈值必须大于 0 且不超过 1')
  if (!Number.isInteger(最小) || 最小 < 2 || 最小 > 20) throw new Error('最小组数必须是 2 到 20 的整数')

  const 输入 = 记录们.map((一, i) => 一 && 一.特征 ? 一 : { ...一, 特征: 特征们(一 && 一.内容), 顺序: i })
    .filter((一) => 一 && 一.键 && 一.内容)
    .sort((a, b) => a.键.localeCompare(b.键))
  const 相似缓存 = new Map()
  function 两条相似(a, b) {
    const 键 = a.键 < b.键 ? `${a.键}\u0000${b.键}` : `${b.键}\u0000${a.键}`
    if (!相似缓存.has(键)) 相似缓存.set(键, 相似度(a.特征, b.特征))
    return 相似缓存.get(键)
  }

  // 完全链接式贪心：新成员必须与组内每一条都达阈值，避免 A-B、B-C 相似却把 A-C 强拉在一起。
  const 组们 = []
  for (const 一 of 输入) {
    let 最佳 = null
    for (const 组 of 组们) {
      if (!可同组(一, 组[0])) continue
      const 分们 = 组.map((二) => 两条相似(一, 二))
      if (分们.some((分) => 分 < 阈值)) continue
      const 平均 = 分们.reduce((和, 分) => 和 + 分, 0) / 分们.length
      if (!最佳 || 平均 > 最佳.平均) 最佳 = { 组, 平均 }
    }
    if (最佳) 最佳.组.push(一)
    else 组们.push([一])
  }

  return 组们.filter((组) => 组.length >= 最小).map((组) => {
    const 两两 = []
    for (let i = 0; i < 组.length; i++) for (let j = i + 1; j < 组.length; j++) 两两.push(两条相似(组[i], 组[j]))
    const 代表 = [...组].map((一) => ({ 一, 平均: 组.filter((二) => 二 !== 一).reduce((和, 二) => 和 + 两条相似(一, 二), 0) / (组.length - 1) }))
      .sort((a, b) => b.平均 - a.平均 || a.一.键.localeCompare(b.一.键))[0].一
    const 共同 = 代表.特征.filter((词) => 组.every((一) => 一.特征.includes(词))).slice(0, 6)
    const 依据 = [...组].sort((a, b) => a.键.localeCompare(b.键)).map(({ 特征, 顺序, 键, ...一 }) => 一)
    const 指纹 = 文本指纹(依据.map((一) => `${一.来源层}:${一.类别}:${一.编号}:${一.内容}`).join('\n'))
    return {
      编号: `cluster-${指纹.slice(0, 16)}`,
      指纹,
      记忆类型: 代表.记忆类型,
      person: 代表.person,
      relationship: 代表.relationship,
      条数: 组.length,
      最低相似度: Number(Math.min(...两两).toFixed(4)),
      平均相似度: Number((两两.reduce((和, 分) => 和 + 分, 0) / 两两.length).toFixed(4)),
      共同线索: 共同,
      摘要候选: `多条记忆共同涉及${共同.length ? `“${共同.join('、')}”` : '同一主题'}；代表内容：${代表.内容}`.slice(0, 500),
      依据,
    }
  }).sort((a, b) => b.条数 - a.条数 || b.平均相似度 - a.平均相似度 || a.编号.localeCompare(b.编号))
}

function 生成报告({ 记录们, 来源统计 = {}, 现在 = () => new Date(), 相似阈值 = 默认相似阈值, 最小组数 = 默认最小组数, 最大条数 = 默认最大条数 } = {}) {
  const 候选 = 聚类(Array.isArray(记录们) ? 记录们 : [], { 相似阈值, 最小组数 })
  const 输入指纹 = 文本指纹((记录们 || []).map((一) => `${一.键}\n${一.内容}`).sort().join('\n'))
  return {
    格式版本: 1,
    用途: '只读审查候选；不参与召回，不自动修改或删除原记忆',
    生成于: new Date(现在()).toISOString(),
    输入指纹,
    规则: {
      算法: '本地双字片段相似度 + 完全链接式贪心聚类',
      相似阈值: Number(相似阈值),
      最小组数: Number(最小组数),
      最大输入条数: Number(最大条数),
      硬边界: ['记忆类型相同', 'person 相同', 'relationship 相同', '组内任意两条达到阈值'],
      摘要方式: '抽取式候选；保留全部依据原文，不调用模型',
    },
    来源统计,
    候选数量: 候选.length,
    候选,
  }
}

function 原子写JSON(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  const 临时 = `${文件}.${process.pid}.tmp`
  try {
    fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
    fs.renameSync(临时, 文件)
  } catch (错误) {
    try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
    throw 错误
  }
}

function 生成并保存({ 输出文件 = 默认输出文件, 临时记忆库 = 临时记忆, 长期记忆库 = 长期记忆, 现在 = () => new Date(), 相似阈值 = 默认相似阈值, 最小组数 = 默认最小组数, 最大条数 = 默认最大条数 } = {}) {
  const 来源 = 读取可聚类记忆({ 临时记忆库, 长期记忆库, 现在, 最大条数 })
  const 报告 = 生成报告({
    记录们: 来源.记录,
    来源统计: { 可聚类条数: 来源.记录.length, 原始数量: 来源.原始数量, 截断数量: 来源.截断数量 },
    现在, 相似阈值, 最小组数, 最大条数,
  })
  原子写JSON(path.resolve(输出文件), 报告)
  return { 好: true, 输出文件: path.resolve(输出文件), 报告 }
}

module.exports = {
  默认相似阈值,
  默认最小组数,
  默认最大条数,
  默认输出文件,
  特征们,
  相似度,
  读取可聚类记忆,
  聚类,
  生成报告,
  生成并保存,
}
