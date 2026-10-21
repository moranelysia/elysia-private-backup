/**
 * 测账本.cjs —— 不开窗口，先把"账本面板会显示成什么样"跑一遍
 *
 * 【为什么值得测】
 *   面板里全是数字和单位换算，最容易出的错不是崩，是**显示得不对**
 *   （比如 0.005 元直接显示成 "0 分"）。而那种错，肉眼在小窗口里
 *   很难发现。所以把它会写上去的字先打出来看一眼。
 *
 * 用法: node tools\测账本.cjs
 */
'use strict'

const path = require('node:path')
const 用量 = require(path.resolve(__dirname, '..', '脑', '用量.cjs'))

// 跟 renderer\账本.js 里那三个写法一模一样 —— 这边改了那边也要改
function 写钱(元) {
  const 分 = 元 * 100
  if (分 >= 100) return 元.toFixed(2) + ' 元'
  if (分 >= 10) return 分.toFixed(1) + ' 分'
  return 分.toFixed(2) + ' 分'
}
function 写数(n) {
  return (n || 0).toLocaleString('zh-CN')
}

console.log('')
console.log('════════ 一、算钱对不对 ════════')

// 拿一次真实请求的用量来试（这是实测过的一组数）
const 例子 = {
  prompt_tokens: 7505,
  prompt_cache_hit_tokens: 7296,
  completion_tokens: 45,
}
const 账 = 用量.算钱(例子)
console.log('  输入 ' + 例子.prompt_tokens + '（命中 ' + 例子.prompt_cache_hit_tokens + '）+ 输出 ' + 例子.completion_tokens)
console.log('  → 命中部分 ' + 写钱(账.输入钱 * (账.命中 / 账.输入)) + ' 那条不单独算了，合起来：')
console.log('  → 输入钱 ' + (账.输入钱 * 100).toFixed(3) + ' 分，输出钱 ' + (账.输出钱 * 100).toFixed(3) + ' 分')
console.log('  → 合计 ' + (账.合计 * 100).toFixed(3) + ' 分   面板会写成：' + 写钱(账.合计))

console.log('')
console.log('════════ 二、单位换算的边界 ════════')
for (const 元 of [0.0001, 0.005, 0.05, 0.5, 0.999, 1.5, 12.345]) {
  console.log('  ' + String(元).padEnd(8) + ' 元  →  面板显示：' + 写钱(元))
}
console.log('  （最要紧的是"不能显示成 0" —— 一句 0.5 分，得看得出是 0.50 分）')

console.log('')
console.log('════════ 三、现在的真实账本 ════════')
const 数 = 用量.汇总(账)
console.log('  这次：' + 写钱(数.这次.合计) + '   输入 ' + 写数(数.这次.输入) + ' / 命中 ' + 写数(数.这次.命中) + ' / 输出 ' + 写数(数.这次.输出))
console.log('  今天：' + 写钱(数.今天.元) + '   ' + 数.今天.次数 + ' 次')
console.log('  一共：' + 写钱(数.一共.元) + '   ' + 数.一共.次数 + ' 次')
console.log('  缓存命中率：' + (数.命中率 * 100).toFixed(1) + '%')

console.log('')
console.log('════════ 四、账本文件 ════════')
const fs = require('node:fs')
if (fs.existsSync(用量.用量文件)) {
  const 行 = fs.readFileSync(用量.用量文件, 'utf8').trim().split('\n')
  console.log('  ' + 用量.用量文件)
  console.log('  共 ' + 行.length + ' 条，最后一条：')
  console.log('    ' + 行[行.length - 1])
} else {
  console.log('  （还没有账本文件 —— 说明还没记过账）')
}
console.log('')
