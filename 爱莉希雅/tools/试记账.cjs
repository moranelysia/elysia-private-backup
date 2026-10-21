/**
 * 试记账.cjs —— 真叫一次记账，把结果账本打出来看
 *
 * 【为什么光有"测试全过"还不够】
 *   测学习进度.cjs 验的是**机制**：文件读得写得出、合并没吃掉他手写的东西、
 *   只在该出现的地方出现。那些都是"对不对"的问题。
 *
 *   可这个功能还有一半是**内容**问题：她记下来的到底是不是人话？
 *   "现在到"写得像不像一句总结？"还没弄明白的"是不是硬凑的？
 *   那种事没法用断言测，只能打出来用眼睛看。
 *
 * 【会花钱】一次很便宜的请求（输出限 400 token）。
 *
 * 用法:
 *   node tools\试记账.cjs
 *   node tools\试记账.cjs "他说的那半句" "她回的那半句"
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 试账本 = path.join(项目根, '.cache', '_试记账.md')

// 指到临时文件 —— 别拿他真账本做实验
process.env.ELYSIA_进度文件 = 试账本

const 学习进度 = require(path.join(项目根, '脑', '学习进度.cjs'))

/** 一开始给一份"已经学过一点"的账本，这样能看出它是接着写还是重头写 */
const 开头 =
  '# 学习进度\n\n' +
  '## C语言程序设计\n\n' +
  '- 现在到：讲了 C 是怎么来的（Unix、B 语言那段）\n' +
  '- 已经弄明白的：为什么叫 C\n' +
  '- 还没弄明白的：\n' +
  '- 下一步：动手写第一个程序\n' +
  '- 上次动过：2026-10-05 20:10\n'

const 默认他 = '今天讲了编译是怎么回事，我大概懂了。但那个"预处理"到底是干嘛的？'
const 默认她 =
  '预处理就是在真正编译之前，先把你的代码"过一遍手"：把 #include 那个文件整个抄进来、' +
  '把 #define 的东西原样替换掉。编译器看到的其实不是你写的那份，是过完手的那份。'

async function 主() {
  const 参数 = process.argv.slice(2)
  const 他说的 = 参数[0] || 默认他
  const 她回的 = 参数[1] || 默认她

  fs.mkdirSync(path.dirname(试账本), { recursive: true })
  fs.writeFileSync(试账本, 开头, 'utf8')

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   真叫一次记账，看它写成什么样')
  console.log('  ════════════════════════════════════════════')
  console.log('')
  console.log('  他：' + 他说的)
  console.log('  她：' + 她回的)
  console.log('')
  console.log('  记之前账本里已经有：' + 学习进度.课程们().join('、'))
  console.log('')

  let 果 = null
  try {
    果 = await 学习进度.记一笔({ 他说的, 她回的 })
  } catch (错误) {
    果 = { 改了: false, 说明: '抛异常了：' + (错误 && 错误.message) }
  }

  console.log('  它说：' + JSON.stringify(果))
  console.log('')
  console.log('  ── 记完之后，账本长这样 ──')
  console.log('')
  const 内容 = 学习进度.读()
  for (const 行 of 内容.split('\n')) console.log('  ' + 行)
  console.log('')

  fs.rmSync(试账本, { force: true })
}

主().catch((错误) => {
  console.log('  ✗ ' + (错误 && 错误.stack))
  process.exit(1)
})
