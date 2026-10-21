/**
 * 看进程.cjs —— 只列出来，一个都不杀
 *
 * 【为什么要跟"全部关掉"分开】
 *   关进程这种动作，得先看得见它要关谁再动手。
 *   他报过"点了 × 之后 python 还在跑" —— 那正是需要这么一双眼睛的时候。
 *
 *   所以"全部关掉"只认**特征**（python 且命令行里有 api_v2.py……），
 *   这个脚本把那些特征摆出来给你核对：认对了再关。
 *   两个文件共用同一套判断（require 进来的），不会各说各话。
 *
 * 用法: node tools\看进程.cjs
 */
'use strict'

const path = require('node:path')
// 判断逻辑在 脑\收摊.cjs —— 跟托盘菜单的"全部关掉"共用同一份，
// 不会出现"这边说该关、那边关掉了别的"这种事。
const { 列进程, 是她的人, 目标 } = require(path.join(__dirname, '..', '脑', '收摊.cjs'))

console.log('')
console.log('  这台机器上跟她有关的进程（只列，不动）')
console.log('  ────────────────────────────────────────────')

let 清单
try {
  清单 = 列进程()
} catch (错误) {
  console.log('  ✗ 问不到进程清单: ' + 错误.message.split('\n')[0])
  process.exit(1)
}

let 认出来的 = 0
for (const 我 of 目标) {
  const 命中 = 清单.filter((p) => 是她的人(p) === 我)
  console.log('')
  console.log(`  【${我.说明}】${命中.length ? '在跑 ' + 命中.length + ' 个' : '没在跑'}`)
  for (const p of 命中) {
    认出来的++
    console.log(`      进程 ${p.编号}   ${p.名字}`)
    console.log(`      ${p.命令行.slice(0, 100)}`)
  }
}

console.log('')
console.log('  ────────────────────────────────────────────')
console.log(`  认出来的一共 ${认出来的} 个。"全部关掉"关的就是这几个。`)
console.log('')
console.log('  别的 python / node（DSH 自己、VS Code、Cyrene）不在上面 ——')
console.log('  那些不属于她这一套，"全部关掉"不该碰它们。')
console.log('')
