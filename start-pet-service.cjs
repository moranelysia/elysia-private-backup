/**
 * start-pet-service.cjs —— 桌宠服务（双击这个文件就能启动）
 *
 * 【它干什么】
 *   盯着 爱莉希雅\.cache\指令队列.json：
 *   谁往里写一条"要做妖精小姐"，它就替谁去按 Alt+2（Bongo Cat 的快捷键）。
 *
 * 【为什么需要它】
 *   DSH 的沙箱不允许开子进程 —— 那边的"她"没法直接模拟按键，
 *   只能写文件。这个服务跑在沙箱外，读到文件后去按键。
 *
 * 【为什么这个文件叫英文名、放在工作区根目录】
 *   .cmd 文件里不能出现任何中文（连中文文件夹名都不行）——
 *   cmd.exe 按系统的 GBK 读文件，而文件是 UTF-8 存的，中文字节会解错、
 *   把命令弄断。所以干脆不用 .cmd，直接双击这个 .cjs。
 *
 * 【怎么用】
 *   双击本文件（或：node start-pet-service.cjs）
 *   要一直开着；关掉它，表情就不动了。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// 项目目录（写死绝对路径 —— 双击运行时工作目录不一定在哪）
const 项目 = 'D:\\新建文件夹\\爱莉希雅'
const 表路径 = path.join(项目, 'renderer', 'assets', '表情表.json')
const 队列路径 = path.join(项目, '.cache', '指令队列.json')
const 检查间隔 = 300

// ---------- 读表情表 ----------
let 表情表 = { 表情: {}, 动画: {}, 语音: {} }
try {
  表情表 = JSON.parse(fs.readFileSync(表路径, 'utf8'))
} catch (err) {
  console.log('⚠ 读不到表情表: ' + err.message)
  console.log('  找的是: ' + 表路径)
}

// ---------- 中文名 → 快捷键 ----------
function 查表(名字) {
  for (const 类别 of ['表情', '动画', '语音']) {
    if (表情表[类别] && 表情表[类别][名字]) return { 类别, 键: 表情表[类别][名字] }
  }
  for (const 类别 of ['表情', '动画', '语音']) {
    const 找到 = Object.entries(表情表[类别] || {}).find(([, v]) => v === 名字)
    if (找到) return { 类别, 键: 名字, 名字: 找到[0] }
  }
  return null
}

// ---------- 按键：用 keybd_event 往系统注入 ----------
// 不用 SendKeys —— 那个只发给"当前活动窗口"，Bongo Cat 在后台就收不到。
function 按Alt加键(键) {
  const 特殊键码 = {
    '-': 0xbd, '=': 0xbb, '[': 0xdb, ']': 0xdd,
    ';': 0xba, "'": 0xde, ',': 0xbc, '.': 0xbe, '/': 0xbf, '\\': 0xdc, '`': 0xc0,
  }
  let vk = 特殊键码[键]
  if (!vk && /^[0-9]$/.test(键)) vk = 键.charCodeAt(0)
  if (!vk && /^[A-Za-z]$/.test(键)) vk = 键.toUpperCase().charCodeAt(0)
  if (!vk) throw new Error('不认识的键: ' + 键)

  const 脚本 = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Kbd {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void AltKey(byte vk) {
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(20);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(40);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
        System.Threading.Thread.Sleep(20);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
    }
}
"@
[Kbd]::AltKey(${vk})
`
  execFileSync('powershell', ['-NoProfile', '-Command', 脚本], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return true
}

// ---------- 主循环 ----------

// Windows 控制台默认是 GBK(936)，而 Node 输出 UTF-8 —— 中文会显示成乱码。
// 这里把控制台切成 UTF-8。失败也没关系（只是显示难看，功能不受影响）。
try {
  execFileSync('cmd', ['/c', 'chcp', '65001'], { stdio: 'ignore' })
} catch {
  /* 忽略 */
}

console.log('')
console.log('  ============================================')
console.log('   桌宠服务已启动')
console.log('  ============================================')
console.log('')
console.log('  表情表: ' + (Object.keys(表情表.表情).length + Object.keys(表情表.动画).length + Object.keys(表情表.语音).length) + ' 个可用')
console.log('  盯着:   ' + 队列路径)
console.log('')
console.log('  谁来写一条指令，我就替谁按快捷键。')
console.log('  按 Ctrl+C 停止。')
console.log('')

let 上次处理的时间 = null

function 标记(队列, 状态) {
  try {
    fs.writeFileSync(
      队列路径,
      JSON.stringify({ ...队列, 状态, 完成时间: new Date().toISOString() }, null, 2),
      'utf8'
    )
  } catch {
    /* 下一轮会重试 */
  }
}

setInterval(() => {
  let 队列
  try {
    if (!fs.existsSync(队列路径)) return
    队列 = JSON.parse(fs.readFileSync(队列路径, 'utf8'))
  } catch {
    return // 文件正被写，读到半个 JSON 很正常
  }

  if (队列.状态 !== '待执行') return
  if (队列.写入时间 === 上次处理的时间) return
  上次处理的时间 = 队列.写入时间

  const 名字 = 队列.要做的
  const 找到 = 查表(名字)
  if (!找到) {
    console.log(`  ✗ 不认识「${名字}」`)
    标记(队列, '不认识这个名字')
    return
  }

  try {
    按Alt加键(找到.键)
    console.log(`  ✓ ${名字}  →  Alt+${找到.键}   (${new Date().toLocaleTimeString()})`)
    标记(队列, '已完成')
  } catch (err) {
    console.log(`  ✗ ${名字} 按键失败: ${err.message}`)
    标记(队列, '按键失败: ' + err.message)
  }
}, 检查间隔)
