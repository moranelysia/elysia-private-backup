/**
 * 产物.cjs —— 文件侧栏能看哪些文件、怎么预览
 *
 * 路径只从主进程进来，但仍然必须经过 路径安全：设置文件和渲染进程都不是权限来源。
 * 文本和图片在侧栏里直接看；其他格式只显示信息，再交给系统默认程序打开。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 路径安全 = require('./路径安全.cjs')

const 最多保留 = 20
const 文本上限 = 300 * 1024
const 图片上限 = 8 * 1024 * 1024
const 文本扩展名 = new Set([
  '.txt', '.md', '.json', '.jsonl', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.html', '.css', '.scss', '.xml', '.yml', '.yaml', '.toml', '.ini', '.cfg',
  '.log', '.csv', '.tsv', '.c', '.h', '.cpp', '.hpp', '.py', '.java', '.rs',
  '.go', '.sql', '.ps1', '.cmd', '.bat', '.sh',
])
const 图片类型 = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

function 核对文件(输入) {
  const 查过 = 路径安全.查(String(输入 || ''), '读')
  if (!查过.好) return { 好: false, 说明: 查过.原因 }
  try {
    const 状态 = fs.statSync(查过.绝对路径)
    if (!状态.isFile()) return { 好: false, 说明: '这不是一个文件' }
    return { 好: true, 路径: 查过.绝对路径, 状态 }
  } catch (错误) {
    return { 好: false, 说明: '文件已经不存在或读不到：' + 错误.message }
  }
}

function 一项(输入) {
  const 果 = 核对文件(输入)
  if (!果.好) return null
  return {
    路径: 果.路径,
    名字: path.basename(果.路径),
    目录: path.dirname(果.路径),
    扩展名: path.extname(果.路径).toLowerCase(),
    大小: 果.状态.size,
    修改时间: 果.状态.mtimeMs,
  }
}

/** 设置里存的路径是不可信输入：逐个验、去重、去掉已经消失的。 */
function 整理名单(路径们) {
  const 结果 = []
  const 见过 = new Set()
  for (const 输入 of Array.isArray(路径们) ? 路径们 : []) {
    const 项 = 一项(输入)
    if (!项) continue
    const 键 = 项.路径.toLowerCase()
    if (见过.has(键)) continue
    见过.add(键)
    结果.push(项)
    if (结果.length >= 最多保留) break
  }
  return 结果
}

/** 从这一轮工具结果中拿成功写出或明确交付的文件。 */
function 从工具结果提取(工具们) {
  return (Array.isArray(工具们) ? 工具们 : [])
    .filter((一件) => {
      const 名字 = 一件 && (一件.名字 || (一件.工具 && 一件.工具.名字))
      return 名字 === '写' || 名字 === '交付'
    })
    .map((一件) => 一件.结果)
    .filter((结果) => 结果 && 结果.好 && 结果.路径 && 结果.目标完成 !== '否')
    .map((结果) => 结果.路径)
}

function 预览(输入) {
  const 果 = 核对文件(输入)
  if (!果.好) return 果
  const 扩展名 = path.extname(果.路径).toLowerCase()
  const 基本 = {
    好: true,
    路径: 果.路径,
    名字: path.basename(果.路径),
    目录: path.dirname(果.路径),
    大小: 果.状态.size,
  }

  if (文本扩展名.has(扩展名)) {
    if (果.状态.size > 文本上限) {
      return { ...基本, 类型: '不能内嵌', 说明: '文本超过 300 KB，请用系统程序打开' }
    }
    try {
      return { ...基本, 类型: '文本', 内容: fs.readFileSync(果.路径, 'utf8') }
    } catch (错误) {
      return { 好: false, 说明: '文本读不出来：' + 错误.message }
    }
  }

  const mime = 图片类型[扩展名]
  if (mime) {
    if (果.状态.size > 图片上限) {
      return { ...基本, 类型: '不能内嵌', 说明: '图片超过 8 MB，请用系统程序打开' }
    }
    try {
      const base64 = fs.readFileSync(果.路径).toString('base64')
      return { ...基本, 类型: '图片', dataUrl: `data:${mime};base64,${base64}` }
    } catch (错误) {
      return { 好: false, 说明: '图片读不出来：' + 错误.message }
    }
  }

  return { ...基本, 类型: '不能内嵌', 说明: '这种格式暂时不能在侧栏内预览，请用系统程序打开' }
}

module.exports = {
  一项,
  整理名单,
  从工具结果提取,
  预览,
  核对文件,
  最多保留,
}
