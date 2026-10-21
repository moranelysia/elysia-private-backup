/**
 * 备份代码.cjs —— 把「爱莉希雅」项目的代码存一份带时间戳的副本
 *
 * 为什么要它：写代码最怕的就是"不小心覆盖了""改坏了想退回去"。
 * 这个脚本把源代码打包存到 backups\ 里，每次跑就多一个时间点。
 *
 * 只备份【源代码】，不备份 node_modules 和模型文件 —— 那些太大，而且装得回来。
 *
 * ⚠ 【2026-10-04：这份**不是**给"她"做备份的那个】
 *   它上面的清单是 2026-09-25 写的，那会儿项目还在弄键盘和 Live2D，
 *   所以它备份的是 键盘监听.ps1、对齐表 那几样。
 *   **她的记忆（记忆\）、她的脑子（脑\）、窗口界面（renderer\chat.js）
 *   一个都不在里面。** 想要那种备份，跑 tools\备份项目.cjs。
 *   留着它是因为按 Alt 键那套东西还在用，别把它当成"我备份过了"。
 *
 * 用法: node tools/备份代码.cjs
 *      （或者双击 备份代码.cmd）
 */
'use strict'

const fs = require('fs')
const path = require('path')

const 项目 = path.resolve(__dirname, '..')
const 备份根 = path.join(项目, 'backups')

// 要备份的东西：项目根目录下的源文件 + renderer 里的代码部分
const 要备份的 = [
  'main.js',
  'preload.js',
  'package.json',
  '.npmrc',
  '学习笔记.md',
  'renderer/index.html',
  'renderer/style.css',
  'tools/键盘监听.ps1',
  'tools/切手部素材.cjs',
  'tools/量手部素材.cjs',
  'tools/重算手部对齐.cjs',
  'tools/生成对齐表.cjs',
  'tools/量键盘位置.cjs',
]

function 时间戳() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function main() {
  const 本次 = path.join(备份根, 时间戳())
  let 存了 = 0
  const 缺的 = []

  for (const rel of 要备份的) {
    const 源 = path.join(项目, rel)
    if (!fs.existsSync(源)) {
      缺的.push(rel)
      continue
    }
    const 目标 = path.join(本次, rel)
    fs.mkdirSync(path.dirname(目标), { recursive: true })
    fs.copyFileSync(源, 目标)
    存了++
  }

  // 顺手把模型的关键配置也存一份（很小）
  const 模型配置 = [
    'renderer/assets/keyboard/对齐表.json',
    'renderer/assets/keyboard/测量.json',
    'renderer/models/elysia/cat.model3.json',
  ]
  for (const rel of 模型配置) {
    const 源 = path.join(项目, rel)
    if (!fs.existsSync(源)) continue
    const 目标 = path.join(本次, rel)
    fs.mkdirSync(path.dirname(目标), { recursive: true })
    fs.copyFileSync(源, 目标)
    存了++
  }

  console.log(`✓ 备份了 ${存了} 个文件`)
  console.log(`  存到: ${本次}`)
  if (缺的.length) console.log(`  （这些没找到，跳过: ${缺的.join(', ')}）`)
  console.log('')
  console.log('  ⚠ 这份里没有 记忆\\ 和 脑\\ —— 要备份"她"本身，跑 tools\\备份项目.cjs')

  // 只留最近 20 份，免得堆一堆
  //
  // 【2026-10-04 修：这段原来会把别人的备份一起吃掉】
  //   原来它把 backups\ 里**所有**目录拿来按名字排序，排在后面的留下。
  //   可这个文件夹不是它一个人的：真正给"她"做的备份是 备份项目.cjs 做的，
  //   名字叫 elysia-<时间>；它自己做的叫 <时间戳>。
  //   按名字排，'2xxxxxxx' 排在 'elysia-…' **前面** ——
  //   于是它刚存完，转头就把自己那份连同 22 份 elysia- 一起删了。
  //   我 2026-10-04 下午真踩了这一下：跑它做备份，回来一看
  //   09-26 到 10-01 的恢复点没了，新做的那份也没了。
  //   两条修：① 只数自己那种名字  ② 按时间排，不按名字排。
  const 自己的长相 = /^\d{8}-\d{6}$/
  const 所有 = fs
    .readdirSync(备份根)
    .filter((n) => 自己的长相.test(n) && fs.statSync(path.join(备份根, n)).isDirectory())
    .map((n) => ({ 名: n, 时间: fs.statSync(path.join(备份根, n)).mtimeMs }))
    .sort((a, b) => a.时间 - b.时间)
  if (所有.length > 20) {
    const 删掉 = 所有.slice(0, 所有.length - 20)
    for (const x of 删掉) fs.rmSync(path.join(备份根, x.名), { recursive: true, force: true })
    console.log(`  （清掉了 ${删掉.length} 份自己的旧备份，只留最近 20 份）`)
  }
}

main()
