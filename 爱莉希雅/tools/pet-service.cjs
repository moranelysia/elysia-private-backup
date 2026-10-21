/**
 * pet-service.cjs —— 常驻小服务：盯着"指令队列"，看到指令就去按键
 *
 * （这个文件原来叫 pet-service.cjs，改名成 ASCII 的，因为 .cmd 引用中文
 *   文件名在某些环境下会出问题。）
 *
 * 【为什么需要它】
 *   有些环境（比如 DSH 的沙箱）不允许程序开子进程 ——
 *   也就是说，那边**没法直接模拟按键**（发 SendKeys 要开 PowerShell）。
 *
 *   所以改成"传纸条"：
 *     那边（沙箱里）→ 往 指令队列.json 写一句"做妖精小姐"
 *     这边（你双击运行，不受限）→ 读到它，真的去按 Alt+2
 *
 * 【它做的事】
 *   每 300 毫秒看一眼队列文件：
 *     · 有"待执行"的指令 → 去按键 → 标记成"已完成"
 *     · 没有 → 继续等
 *
 * 【怎么启动】
 *   双击 tools\pet-service.cmd
 *   （要一直开着；关掉它，表情就不动了）
 */
'use strict'

const fs = require('node:fs')
const bridge = require('./bridge.cjs')

const 队列路径 = bridge.队列路径
const 检查间隔 = 300 // 毫秒
let 上次处理的时间 = null

console.log('')
console.log('  ============================================')
console.log('   桌宠服务（pet-service）已启动')
console.log('  ============================================')
console.log('')
console.log('  它在盯着这个文件：')
console.log('    ' + 队列路径)
console.log('')
console.log('  别人往里面写"要做的表情"，它就替你去按快捷键。')
console.log('  按 Ctrl+C 停止。')
console.log('')

function 看一眼() {
  let 队列
  try {
    if (!fs.existsSync(队列路径)) return
    队列 = JSON.parse(fs.readFileSync(队列路径, 'utf8'))
  } catch {
    return // 文件正在被写，读到半个 JSON 是正常的，下一轮再看
  }

  if (队列.状态 !== '待执行') return
  if (队列.写入时间 === 上次处理的时间) return

  上次处理的时间 = 队列.写入时间
  const 名字 = 队列.要做的

  const 找到 = bridge.查表(名字)
  if (!找到) {
    console.log(`  ✗ 不认识「${名字}」`)
    标记(队列, '不认识这个名字')
    return
  }

  try {
    bridge.按Alt加键(找到.键)
    console.log(`  ✓ ${名字}  →  Alt+${找到.键}   (${new Date().toLocaleTimeString()})`)
    标记(队列, '已完成')
  } catch (err) {
    console.log(`  ✗ ${名字} 按键失败: ${err.message}`)
    标记(队列, '按键失败: ' + err.message)
  }
}

function 标记(队列, 状态) {
  try {
    fs.writeFileSync(
      队列路径,
      JSON.stringify({ ...队列, 状态, 完成时间: new Date().toISOString() }, null, 2),
      'utf8'
    )
  } catch {
    /* 写失败就算了，下一轮会重试 */
  }
}

setInterval(看一眼, 检查间隔)
