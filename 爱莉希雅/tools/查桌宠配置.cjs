/**
 * 查桌宠配置.cjs —— 看 Bongo Cat 这一版到底挂了哪些表情
 *
 * 【为什么需要这个工具】
 *   他报"她不会做动作"，我查了半天才发现：桌面上跑的那个是**无表情版**，
 *   它的配置里"键鼠模式下的表情"那一栏是空的 —— 所以按 Alt+Q 它收到了，
 *   但不知道该干什么。
 *
 *   问题是这个坑**看不出来**：程序能开、能跟着打字、图标也在托盘上，
 *   一点异常都没有。只有把 config.json 打开对着看，才知道少了东西。
 *
 *   所以写个小工具，一眼就能看出"这一版挂了几个表情"。
 *
 * 【为什么不能直接 JSON.parse】
 *   Bongo Cat 的 config.json 里带 `//` 注释（作者用它标了每个表情的名字），
 *   标准的 JSON 不允许注释，直接 parse 会报错。
 *   所以下面先把注释和尾逗号清掉，再解析 —— 这段手法叫"洗 JSON"。
 *
 * 用法: node tools\查桌宠配置.cjs
 *       node tools\查桌宠配置.cjs "D:\某个路径\A-爱莉-带表情版"
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** 把带注释的 JSON 洗成能解析的 */
function 洗JSON(文本) {
  let 干净 = ''
  let 在文字里 = false
  let 在转义 = false

  for (let i = 0; i < 文本.length; i++) {
    const 字 = 文本[i]

    if (在文字里) {
      干净 += 字
      if (在转义) 在转义 = false
      else if (字 === '\\') 在转义 = true
      else if (字 === '"') 在文字里 = false
      continue
    }

    if (字 === '"') {
      在文字里 = true
      干净 += 字
      continue
    }

    // 行注释
    if (字 === '/' && 文本[i + 1] === '/') {
      while (i < 文本.length && 文本[i] !== '\n') i++
      干净 += '\n'
      continue
    }

    // 块注释
    if (字 === '/' && 文本[i + 1] === '*') {
      i += 2
      while (i < 文本.length && !(文本[i] === '*' && 文本[i + 1] === '/')) i++
      i++
      continue
    }

    干净 += 字
  }

  // 尾逗号：{"a":1,} → {"a":1}
  return 干净.replace(/,(\s*[}\]])/g, '$1')
}

const 模式名 = { gamepad: '手柄模式', keyboard: '纯键盘模式', standard: '键鼠模式' }

function 看一版(目录) {
  const 配置路径 = path.join(目录, 'config.json')
  console.log('════════════════════════════════════════')
  console.log(' ' + path.basename(目录))
  console.log('════════════════════════════════════════')

  if (!fs.existsSync(配置路径)) {
    console.log('  ✗ 没有 config.json')
    console.log('')
    return
  }

  let 配置
  try {
    配置 = JSON.parse(洗JSON(fs.readFileSync(配置路径, 'utf8')))
  } catch (错误) {
    console.log('  ✗ 配置读不动: ' + 错误.message)
    console.log('')
    return
  }

  console.log('  当前模式 mode = ' + 配置.mode + '（1 = 键鼠）')
  console.log('')

  for (const 键 of ['standard', 'keyboard', 'gamepad']) {
    const 块 = 配置[键]
    if (!块) continue
    const 表情 = 块.l2d_expression || []
    const 动作 = 块.l2d_motion_lockhand || []
    const 语音 = 块.sounds || []
    const 总数 = 表情.length + 动作.length

    const 评价 = 总数 === 0 ? '✗ 空的！按 Alt+某键不会有反应' : `✓ 挂了 ${总数} 个表情动作`
    console.log(`  【${模式名[键]}】${评价}`)
    if (总数 > 0) {
      console.log(`     形态 ${表情.length} 个 / 动作与语音 ${动作.length} 个 / 语音 ${语音.length} 段`)
    }
  }

  // 模型文件全不全，也是"能不能动"的关键
  const 模型目录 = path.join(目录, 'img', 'standard', 'cat_model')
  if (fs.existsSync(模型目录)) {
    const 文件 = fs.readdirSync(模型目录)
    const 动作数 = 文件.filter((名) => 名.endsWith('.motion3.json')).length
    const 表情数 = 文件.filter((名) => 名.endsWith('.exp3.json')).length
    console.log('')
    console.log(`  模型素材：${动作数} 个动作文件、${表情数} 个表情文件`)
    if (动作数 === 0) console.log('     ✗ 一个动作文件都没有 —— 这一版只做了"跟着打字"')
  }

  console.log('')
}

const 参数 = process.argv[2]
const 目录们 = 参数
  ? [参数]
  : [
      'D:\\新建文件夹\\zhuochong\\A-爱莉-带表情版',
      'D:\\新建文件夹\\zhuochong\\A-爱莉-无表情版',
      'D:\\新建文件夹\\zhuochong\\Z-有按键显示',
      'D:\\新建文件夹\\zhuochong\\Z-无按键显示',
    ]

console.log('')
for (const 目录 of 目录们) {
  if (fs.existsSync(目录)) 看一版(目录)
}

// 顺手看看现在跑着的那个是从哪儿启动的
console.log('════════════════════════════════════════')
console.log(' 怎么知道现在跑的是哪一版')
console.log('════════════════════════════════════════')
console.log('  任务管理器 → 找到 Bongo Cat Mver.exe → 右键"打开文件所在的位置"')
console.log('  看它落在 A-爱莉-带表情版 还是 A-爱莉-无表情版。')
console.log('  要换：托盘右键退出它，再双击 tools\\启动桌宠.cjs。')
console.log('')
