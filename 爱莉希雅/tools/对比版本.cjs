/**
 * 对比版本.cjs —— 两个桌宠版本的配置到底差在哪儿
 *
 * 【为什么要看这个】
 *   他报"打开这个没有出现桌宠"。要看的是：
 *   桌面宠窗口会被画在哪儿、多大、是不是根本没在屏幕上。
 *   （Bongo Cat 会把窗口位置记在 config.json 的 workarea 里，
 *     如果他以前接过显示器/改过分辨率，那个坐标可能已经在屏幕外了 ——
 *     程序"在跑"，但你看不见它。这跟"没启动"完全是两回事。）
 *
 * 用法: node tools\对比版本.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** 把带 `//` 注释的 JSON 洗成能解析的 */
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
    if (字 === '/' && 文本[i + 1] === '/') {
      while (i < 文本.length && 文本[i] !== '\n') i++
      干净 += '\n'
      continue
    }
    if (字 === '/' && 文本[i + 1] === '*') {
      i += 2
      while (i < 文本.length && !(文本[i] === '*' && 文本[i + 1] === '/')) i++
      i++
      continue
    }
    干净 += 字
  }
  return 干净.replace(/,(\s*[}\]])/g, '$1')
}

const 根 = 'D:\\新建文件夹\\zhuochong'

for (const 版 of ['A-爱莉-带表情版', 'A-爱莉-无表情版']) {
  const 路径 = path.join(根, 版, 'config.json')
  console.log('════════════════════════════════════════')
  console.log(' ' + 版)
  console.log('════════════════════════════════════════')
  if (!fs.existsSync(路径)) {
    console.log('  （没有这个版本）')
    console.log('')
    continue
  }

  let c
  try {
    c = JSON.parse(洗JSON(fs.readFileSync(路径, 'utf8')))
  } catch (错误) {
    console.log('  ✗ 配置读不动: ' + 错误.message)
    console.log('')
    continue
  }

  const d = c.decoration || {}
  console.log('  mode          : ' + c.mode + '   (1 = 键鼠模式)')
  console.log('  desktop_pet   : ' + d.desktop_pet + '   ← 是不是"桌宠模式"（会把窗口铺满一小块桌面）')
  console.log('  topWindow     : ' + d.topWindow + '   ← 是不是压在别的窗口上面')
  console.log('  window_size   : ' + JSON.stringify(d.window_size) + '   ← 窗口有多大（像素）')
  console.log('  workarea      : ' + JSON.stringify(c.workarea))
  console.log('      top_left  : ' + JSON.stringify((c.workarea || {}).top_left) + '   ← 它会画在屏幕的哪个角')
  console.log('  offsetX       : ' + JSON.stringify(d.offsetX))
  console.log('  offsetY       : ' + JSON.stringify(d.offsetY))
  console.log('  scalar        : ' + JSON.stringify(d.scalar) + '   ← 缩放（太小就几乎看不见）')
  console.log('  leftHanded    : ' + d.leftHanded)

  const st = c.standard || {}
  console.log('  键鼠模式里的键盘图: ' + JSON.stringify(st.keyboard))
  console.log('  键鼠模式 mouse     : ' + st.mouse)
  console.log('')
}

console.log('════════════════════════════════════════')
console.log(' 怎么判断"它在跑但你看不见"')
console.log('════════════════════════════════════════')
console.log('  1. 打开任务管理器，看有没有 Bongo Cat Mver.exe')
console.log('     · 有 → 它在跑，只是窗口没画在你看得见的地方（看上面 workarea 那个坐标）')
console.log('     · 没有 → 它压根没启动起来')
console.log('  2. Bongo Cat 自己有个托盘图标，右键里面有"重置位置/位置"之类的项')
console.log('     也可以直接把它那个托盘图标双击，通常会把它叫回屏幕中间')
console.log('')
