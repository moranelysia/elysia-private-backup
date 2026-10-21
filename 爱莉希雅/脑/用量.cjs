/**
 * 用量.cjs —— 记下"她每次开口花了多少"，算给你看
 *
 * 【为什么要有这个】
 *   她说话走的是模型接口，花的是当前使用者自己的 token。
 *   花钱的事不能糊着 —— 他自己问过一次"用的是我的 token 吗"，
 *   那说明他需要看得见。所以每次请求的用量都记一份，攒成账。
 *
 * 【记在哪儿、为什么这么记】
 *   记忆\用量.jsonl —— 一行一条，追加着写。
 *   为什么不用 json 数组：那是"读出来-改-写回去"，程序要是中途被
 *   关掉（他关机、或者点退出），正在写的那次就丢了。
 *   追加写（appendFile）不会丢已经写下的行，而且这个文件用记事本
 *   直接就能看，一行一次对话，清清楚楚。
 *
 * 【价钱】
 *   DeepSeek 的价目，单位是"元 / 每百万 token"。价格会变，
 *   所以写成常量放最上面，哪天变了改这两个数字就行，别改逻辑。
 *   缓存命中便宜八倍 —— 这就是为什么人格那一大段要放最前面、
 *   而且每次一字不改。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('./配置.cjs')

const 记忆目录 = 配置.数据目录
const 用量文件 = path.join(记忆目录, '用量.jsonl')

// 价目（元 / 百万 token）—— 来自 DeepSeek 官网定价页
const 价钱 = {
  输入_缓存命中: 0.5,
  输入_缓存未命中: 4,
  输出: 12,
}

/** 把一次请求的用量换算成钱（元） */
function 算钱(用了) {
  if (!用了) {
    return { 命中: 0, 未命中: 0, 输入: 0, 输出: 0, 输入钱: 0, 输出钱: 0, 合计: 0 }
  }
  const 命中 = 用了.prompt_cache_hit_tokens || 0
  const 输入总 = 用了.prompt_tokens || 0
  const 未命中 = Math.max(0, 输入总 - 命中)
  const 输出 = 用了.completion_tokens || 0

  const 输入钱 = (命中 / 1e6) * 价钱.输入_缓存命中 + (未命中 / 1e6) * 价钱.输入_缓存未命中
  const 输出钱 = (输出 / 1e6) * 价钱.输出

  return { 命中, 未命中, 输入: 输入总, 输出, 输入钱, 输出钱, 合计: 输入钱 + 输出钱 }
}

/** 现在的时刻，写成 'YYYY-MM-DD HH:mm' —— **本地时间** */
function 现在() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ` +
    `${补(d.getHours())}:${补(d.getMinutes())}`
  )
}

/** 记一次 */
function 记一次(用了) {
  const 账 = 算钱(用了)
  const 条 = {
    // 【2026-10-01 改过】原来这里是 new Date().toISOString()，也就是 UTC。
    //   两个毛病：
    //     1. 账本里写着 11:03，而墙上钟是 19:03 —— 对不上，看着像错的
    //     2. **"今天花了多少"会在早上八点就翻篇**（UTC 零点 = 北京八点）
    //   项目别处（记忆、聊天记录）都用本地时间，账本没道理不一样。
    时间: 现在(),
    输入: 账.输入,
    命中: 账.命中,
    未命中: 账.未命中,
    输出: 账.输出,
    元: Number(账.合计.toFixed(8)),
  }

  try {
    fs.mkdirSync(记忆目录, { recursive: true })
    fs.appendFileSync(用量文件, JSON.stringify(条) + '\n', 'utf8')
  } catch (错误) {
    console.log('⚠ 用量没记下来: ' + 错误.message)
  }

  return 账
}

/**
 * 把一条记录的时间归到哪一天。
 *
 * 【为什么要兼容两种格式】
 *   老记录是 UTC 的 ISO 串（"2026-10-01T11:03:22.452Z"），新记录是本地时间
 *   （"2026-10-01 19:03"）。账本是追加写的，所以两种会并存一段时间。
 *   两种格式的**日期部分都是开头那 10 个字符**（YYYY-MM-DD），所以直接取。
 *   （老记录那一天按 UTC 算会差几小时，但那几笔已经翻过去了，不值得为它写换算。）
 *
 * 【2026-10-01 这里栽过一次，所以写清楚】
 *   改成本地时间的时候，我把这个函数写成了「取前 10 个字」就完事，
 *   于是顺手也把 `哪一天(new Date())` 这种调用弄坏了 ——
 *   因为 `String(new Date())` 得到的是 "Thu Oct 01 2026 19:07:..."，
 *   取前 10 个字就是 "Thu Oct 0"，永远对不上，于是"今天"永远是 0 次。
 *   所以这里显式处理 Date 对象：**传 Date 进来就按本地日期格式化**。
 */
function 哪一天(时间) {
  if (时间 instanceof Date) {
    const 补 = (n) => String(n).padStart(2, '0')
    return `${时间.getFullYear()}-${补(时间.getMonth() + 1)}-${补(时间.getDate())}`
  }
  const 文本 = String(时间 || '')
  // ISO 串（带 T）或本地串（带空格）都是前 10 个字是日期
  return 文本.slice(0, 10)
}

/** 读全部账本（坏了就跳过那一行，不让一个坏文件把统计搞崩） */
function 读全部() {
  let 内容
  try {
    内容 = fs.readFileSync(用量文件, 'utf8')
  } catch {
    return []
  }
  const 全部 = []
  for (const 行 of 内容.split('\n')) {
    if (!行.trim()) continue
    try {
      const 条 = JSON.parse(行)
      if (typeof 条.元 === 'number') 全部.push(条)
    } catch {
      /* 坏行跳过 */
    }
  }
  return 全部
}

/**
 * 汇总，给小窗口看的。
 *
 * @param {object|null} 最近一次  刚才这次请求的账（算钱() 的结果）
 * @returns {{这次:object|null, 今天:object, 一共:object, 次数:number}}
 */
function 汇总(最近一次 = null) {
  const 全部 = 读全部()
  const 今天 = 哪一天(new Date())

  const 空 = { 次数: 0, 输入: 0, 命中: 0, 未命中: 0, 输出: 0, 元: 0 }
  const 今天账 = { ...空 }
  const 总共账 = { ...空 }

  for (const 条 of 全部) {
    总共账.次数++
    总共账.输入 += 条.输入 || 0
    总共账.命中 += 条.命中 || 0
    总共账.未命中 += 条.未命中 || 0
    总共账.输出 += 条.输出 || 0
    总共账.元 += 条.元 || 0

    if (哪一天(条.时间) === 今天) {
      今天账.次数++
      今天账.输入 += 条.输入 || 0
      今天账.命中 += 条.命中 || 0
      今天账.未命中 += 条.未命中 || 0
      今天账.输出 += 条.输出 || 0
      今天账.元 += 条.元 || 0
    }
  }

  return {
    这次: 最近一次,
    今天: 今天账,
    一共: 总共账,
    // 缓存命中率：命中的输入占全部输入的比例。越高越省钱。
    命中率: 总共账.输入 > 0 ? 总共账.命中 / 总共账.输入 : 0,
  }
}

module.exports = { 记一次, 算钱, 汇总, 读全部, 哪一天, 价钱, 用量文件, 现在 }

// 命令行：node 脑\用量.cjs
if (require.main === module) {
  const 数 = 汇总()
  const 分 = (元) => (元 * 100).toFixed(2) + ' 分'
  console.log('')
  console.log('账本: ' + 用量文件)
  console.log('')
  console.log('  今天：' + 数.今天.次数 + ' 次   ' + 分(数.今天.元))
  console.log('  一共：' + 数.一共.次数 + ' 次   ' + 分(数.一共.元))
  console.log('  缓存命中率：' + (数.命中率 * 100).toFixed(1) + '%')
  console.log('')
}
