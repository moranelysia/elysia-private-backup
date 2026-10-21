/**
 * 测动手.cjs —— 检查"她能动哪些东西"管得严不严
 *
 * 【为什么这个测试比功能本身还重要】
 *   "读文件"是个危险的本事。管不住的话，她能读到：
 *     · 你的 API 钥匙（那能直接花你的钱）
 *     · 整台机器的任意文件
 *     · 别人的仓库源码（一大坨，塞进对话里烧 token）
 *
 *   提示词里写多少句"不许读敏感文件"都不算数 ——
 *   她是在生成文字，可能被绕、可能写错。
 *   **真正拦住她的是 脑\动手.cjs 里的路径判断**，所以那是必须量的地方。
 *
 * 这个脚本拿一堆"该拦"和"该放"的路径来过一遍，两边都要看。
 *
 * 用法: node tools\测动手.cjs
 */
'use strict'

const path = require('node:path')
const 动手 = require(path.resolve(__dirname, '..', '脑', '动手.cjs'))

/** 只看"放不放行"，不真读内容 */
function 放行吗(她写的) {
  const 结果 = 动手.查路径(她写的)
  return 结果.好 ? { 放行: true, 到哪: path.relative(path.resolve(__dirname, '..', '..'), 结果.绝对路径) } : { 放行: false, 原因: 结果.原因 }
}

// 【必须拦住】这些要是放行了，就是出事
const 该拦 = [
  ['她的 API 钥匙', '脑\\钥匙.txt'],
  ['DSH 的凭证文件', 'C:\\Users\\moran\\.dsh\\.credentials.yaml'],
  ['依赖目录', 'node_modules'],
  ['她自己的缓存（一堆没用的）', '.cache'],
  ['别人的仓库源码', 'cyrene-源码'],
  ['用 .. 往上爬', '记忆\\..\\..\\Windows\\System32'],
  ['用 .. 爬到盘根', '记忆\\..\\..\\..\\..'],
  ['绝对路径直接指系统目录', 'C:\\Windows\\System32\\config\\SAM'],
  ['空路径', ''],
  ['不存在的文件', '记忆\\根本没有这个文件.json'],
]

// 【必须放行】这些是她该能看的
const 该放 = [
  ['她的事实记忆', '记忆\\事实.json'],
  ['她的记忆目录', '记忆'],
  ['她的代码', '脑'],
  ['她的表情表', 'renderer\\assets\\表情表.json'],
  ['工作区里的角色卡', 'elysia.cosplay.v2.json'],
  ['工作区根的普通文件', '验收成功.txt'],
  ['工作区里的学习笔记', '爱莉希雅\\学习笔记.md'],
]

console.log('')
console.log('  ════════ 必须拦住的 ════════')
let 拦对了 = 0
for (const [说明, 路径] of 该拦) {
  const r = 放行吗(路径)
  const 好 = !r.放行
  if (好) 拦对了++
  console.log(`  ${好 ? '✓' : '✗ 放行了！'} ${说明}`)
  console.log(`      ${JSON.stringify(路径)}`)
  if (!好) console.log(`      → 她能看到 ${r.到哪}`)
  else if (r.原因) console.log(`      → ${r.原因.slice(0, 50)}`)
}

console.log('')
console.log('  ════════ 必须放行的 ════════')
let 放对了 = 0
for (const [说明, 路径] of 该放) {
  const r = 放行吗(路径)
  const 好 = r.放行
  if (好) 放对了++
  console.log(`  ${好 ? '✓' : '✗ 被拦了！'} ${说明}`)
  console.log(`      ${JSON.stringify(路径)}`)
  if (!好) console.log(`      → ${r.原因.slice(0, 60)}`)
}

console.log('')
console.log('  ══════════════════════════════════════')
console.log(`  该拦的：${拦对了} / ${该拦.length}`)
console.log(`  该放的：${放对了} / ${该放.length}`)
console.log('')

if (拦对了 === 该拦.length && 放对了 === 该放.length) {
  console.log('  ✓ 全对。可以让她用这三样本事了。')
} else {
  console.log('  ✗ 有不对的 —— 先改 脑\\动手.cjs 里的白名单和禁地，别急着接进对话。')
  process.exitCode = 1
}
console.log('')
console.log('  白名单（她能进的目录）：')
for (const 目录 of 动手.白名单()) {
  console.log('    ' + path.relative(path.resolve(__dirname, '..', '..'), 目录))
}
console.log('')
console.log('  禁地（就算在白名单里也不给看）：')
console.log('    ' + 动手.禁地.join('、'))
console.log('')
