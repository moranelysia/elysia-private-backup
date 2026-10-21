/**
 * 加一条守则.cjs —— 往她的守则末尾追加一条
 *
 * 【为什么要有这么个脚本，而不是直接手改那个 JSON】
 *   她的守则在 elysia.cosplay.v2.json 里，是**一整行转义过的长字符串**
 *   （换行写作 \n，引号写作 \"）。手改特别容易碰坏引号或者转义，
 *   而碰坏的表现很难看：轻则那一条读不出来，重则整个角色卡解析失败 ——
 *   桌宠这边当场起不来，DSH 那边预设也装不上。
 *   所以让程序去改，改完它自己从头验一遍，验不过就一个字都不写。
 *
 * 【为什么内容要从文件读，不从命令行参数传】
 *   命令行里的换行、引号、中文标点经过 PowerShell 转一手就变形了。
 *   写成文件最稳 —— 文件里是什么就是什么。
 *
 * 用法:
 *   node tools\加一条守则.cjs <装着新守则的文本文件>
 *   例：node tools\加一条守则.cjs .cache\新守则.txt
 *
 * 它会做四件事：
 *   1. 把原文件抄一份到 .cache\角色卡.json.改之前
 *   2. 检查这一条是不是已经加过了（加过就直接退出，不重复加）
 *   3. 改
 *   4. 从头 JSON.parse 一遍验证 —— 验不过就把原样写回去
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.resolve(项目根, '..')
const 角色卡 = path.join(工作区根, 'elysia.cosplay.v2.json')
const 备份到 = path.join(项目根, '.cache', '角色卡.json.改之前')

function 主() {
  const 内容文件 = process.argv[2]
  if (!内容文件) {
    console.log('  用法: node tools\\加一条守则.cjs <装着新守则的文本文件>')
    process.exit(1)
  }

  const 内容路径 = path.isAbsolute(内容文件) ? 内容文件 : path.join(项目根, 内容文件)
  if (!fs.existsSync(内容路径)) {
    console.log('  ✗ 找不到那个文件：' + 内容路径)
    process.exit(1)
  }

  const 要加的 = fs.readFileSync(内容路径, 'utf8').replace(/\r\n/g, '\n').trimEnd()
  if (!要加的) {
    console.log('  ✗ 那个文件是空的')
    process.exit(1)
  }

  const 原文 = fs.readFileSync(角色卡, 'utf8')
  let 卡
  try {
    卡 = JSON.parse(原文)
  } catch (错误) {
    console.log('  ✗ 角色卡现在就是坏的，先别动它：' + 错误.message)
    process.exit(1)
  }

  const 扩展 = 卡.data && 卡.data.extensions && 卡.data.extensions.dshCosplay
  if (!扩展 || typeof 扩展.rules !== 'string') {
    console.log('  ✗ 这个角色卡里没有 extensions.dshCosplay.rules —— 结构变了，别瞎改')
    process.exit(1)
  }

  // 【防重复】认这一条的头 30 个字。加过就别再加了 ——
  //   重复加不会报错，只会让那条规矩在她说的人设里出现两遍、白占 token。
  const 记号 = 要加的.slice(0, 30)
  if (扩展.rules.includes(记号)) {
    console.log('  · 这一条已经在里面了，没重复加')
    console.log('    开头是：' + 记号 + '…')
    process.exit(0)
  }

  const 旧的 = 扩展.rules
  const 新的 = 旧的.replace(/\s*$/, '') + '\n' + 要加的 + '\n'

  // 【这一步是关键】用 JSON.stringify 把两头都转义成"文件里那个样子"，
  //   再在原文里做精确替换 —— 这样除了这几个字，别的一个字节都不动。
  //   （如果改成 JSON.stringify(整个卡) 写回去，文件会被重排成几千行，
  //     他以后就没法用编辑器看它了。）
  const 旧片段 = JSON.stringify(旧的)
  const 新片段 = JSON.stringify(新的)
  if (!原文.includes(旧片段)) {
    console.log('  ✗ 在原文件里找不到那条守则的原样文本 —— 可能是转义方式不一样，没敢动')
    process.exit(1)
  }

  const 改后 = 原文.replace(旧片段, 新片段)

  // 【验】解析得开、而且新内容真的在里面，才算数
  let 验
  try {
    验 = JSON.parse(改后)
  } catch (错误) {
    console.log('  ✗ 改完解析不开了，一个字都没写。错误：' + 错误.message)
    process.exit(1)
  }
  const 验规则 = 验.data.extensions.dshCosplay.rules
  if (!验规则.includes(记号) || 验规则.length <= 旧的.length) {
    console.log('  ✗ 改完看着不对，没写。')
    process.exit(1)
  }
  // 除了这一条，别的字段一个都不能变
  if (JSON.stringify(验.data.personality) !== JSON.stringify(卡.data.personality)) {
    console.log('  ✗ 别的字段被动了，没写。')
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(备份到), { recursive: true })
  fs.writeFileSync(备份到, 原文, 'utf8')
  fs.writeFileSync(角色卡, 改后, 'utf8')

  console.log('')
  console.log('  ✓ 加进去了')
  console.log('    改之前那份抄在：' + 备份到)
  console.log('    守则从 ' + 旧的.length + ' 字变成 ' + 验规则.length + ' 字')
  console.log('    新加的这条开头是：' + 记号 + '…')
  console.log('')
  console.log('    桌宠这边每次开口都重读这个文件 —— 立刻生效，不用重启。')
  console.log('    DSH 那边要跑一次 scripts\\update-preset.cmd 才会跟着变。')
  console.log('')
}

主()
