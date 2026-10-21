/**
 * bridge.cjs —— 我们和 Bongo Cat 之间的翻译官
 *
 * 【它解决什么问题】
 *   我们想让桌宠"变个表情"，但：
 *     · 我们说的是中文名字（"妖精小姐"）
 *     · Bongo Cat 认的是快捷键（Alt+2）
 *   这两边语言不通，所以要有个翻译。
 *
 * 【两条发送通道】（因为运行环境不一样，能用的手段也不同）
 *
 *   通道一：直接模拟按键
 *     node 开一个 PowerShell，用 keybd_event 把按键注入系统 —— 立刻生效
 *     限制：有些环境（比如 DSH 的沙箱）不允许开子进程，会失败
 *
 *   通道二：写指令文件（备用，也是给沙箱环境用的）
 *     把"要做妖精小姐"写进 指令队列.json
 *     另一个常驻的小服务（pet-service.cjs）读到它，再去按键
 *     限制：慢一点点（最多半秒），但什么环境都能用
 *
 *   本模块会**自动选**：先试通道一，不行就写文件。
 *
 * 【为什么能成】
 *   已经实测过了：Bongo Cat 用全局快捷键，
 *   我们往系统注入 Alt+某键，它就能收到。
 *
 * 用法（当模块用）:
 *   const bridge = require("./bridge.cjs")
 *   bridge.做表情("妖精小姐")
 *
 * 用法（命令行测试）:
 *   node tools/bridge.cjs 妖精小姐
 *   node tools/bridge.cjs 列表
 */
'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const 配置 = require('../脑/配置.cjs')

// 表情表（中文名 → 快捷键）
const 表路径 = path.resolve(__dirname, '..', 'renderer', 'assets', '表情表.json')
// 指令队列（通道二用：写到这里，让常驻服务去执行）
const 队列路径 = path.join(配置.缓存目录, '指令队列.json')

let 表情表 = { 表情: {}, 动画: {}, 语音: {} }

try {
  表情表 = JSON.parse(fs.readFileSync(表路径, 'utf8'))
} catch (err) {
  console.log('⚠ 读不到表情表: ' + err.message)
}

/**
 * 通道一：模拟按下 Alt+某键
 *
 * 【为什么用 keybd_event 而不是 SendKeys】
 *   第一版用的是 .NET 的 SendKeys —— 它把按键发给"当前活动窗口"。
 *   实测：Bongo Cat 在后台时，按键就发到别的窗口去了，它收不到。
 *
 *   keybd_event 是 Windows 底层 API，直接把按键事件注入系统 ——
 *   跟"你真的按了键盘"几乎一样。全局键盘钩子一定能收到，
 *   不管当时哪个窗口在前台。
 *
 * 在沙箱外能成；在沙箱里会抛 EPERM，调用方负责降级（写队列）。
 */
function 按Alt加键(键) {
  // 按键 → 虚拟键码（Virtual-Key code）
  const 特殊键码 = {
    '-': 0xbd, '=': 0xbb, '[': 0xdb, ']': 0xdd,
    ';': 0xba, "'": 0xde, ',': 0xbc, '.': 0xbe, '/': 0xbf, '\\': 0xdc, '`': 0xc0,
  }
  let vk = 特殊键码[键]
  if (!vk && /^[0-9]$/.test(键)) vk = 键.charCodeAt(0) // 0-9 就是 0x30-0x39
  if (!vk && /^[A-Za-z]$/.test(键)) vk = 键.toUpperCase().charCodeAt(0) // A-Z 就是 0x41-0x5A

  if (!vk) throw new Error('不认识的键: ' + 键)

  const 脚本 = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Kbd {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void AltKey(byte vk) {
        keybd_event(0x12, 0, 0, UIntPtr.Zero);          // Alt 按下
        System.Threading.Thread.Sleep(20);
        keybd_event(vk, 0, 0, UIntPtr.Zero);            // 键 按下
        System.Threading.Thread.Sleep(40);
        keybd_event(vk, 0, 2, UIntPtr.Zero);            // 键 抬起
        System.Threading.Thread.Sleep(20);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);          // Alt 抬起
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

/**
 * 通道二：把指令写进队列文件
 *
 * 给"开不了子进程"的环境用的（比如 DSH 的沙箱）。
 * 常驻服务「pet-service.cjs」会盯着这个文件。
 */
function 写进队列(名字) {
  const 队列 = {
    要做的: 名字,
    写入时间: new Date().toISOString(),
    状态: '待执行',
  }
  fs.mkdirSync(path.dirname(队列路径), { recursive: true })
  fs.writeFileSync(队列路径, JSON.stringify(队列, null, 2), 'utf8')
  return 队列路径
}

/** 在所有类别里找这个名字对应的快捷键（要一字不差） */
function 查表(名字) {
  for (const 类别 of ['表情', '动画', '语音']) {
    if (表情表[类别] && 表情表[类别][名字]) {
      return { 类别, 键: 表情表[类别][名字] }
    }
  }
  // 也允许直接传快捷键（比如 "Q"）
  for (const 类别 of ['表情', '动画', '语音']) {
    const 找到 = Object.entries(表情表[类别] || {}).find(([, v]) => v === 名字)
    if (找到) return { 类别, 键: 名字, 名字: 找到[0] }
  }
  return null
}

/**
 * 她写的表情名字，偶尔会有错字（实测遇到过"眯脉"，她想说的是"眯眯眼"）。
 *
 * 【为什么要兜这一下】
 *   她是在"生成文字"，不是在"查表" —— 生成出来的字偶尔会飘。
 *   她那边一飘，桌面上那个她就一动不动，而这件事**从界面上完全看不出来**：
 *   话说了、声音也响了，就是没动。
 *
 * 【怎么兜】先找一模一样的；找不到，再找"谁包含谁"（按长度排，取最像的那个）。
 *   还是不放心，所以 main.js 那边认不出来会打一行警告 —— 宁可留个痕迹，不要悄悄不动。
 *
 * @returns {{类别:string, 键:string, 名字?:string, 猜测?:boolean}|null}
 */
function 大概查表(名字) {
  const 原名 = String(名字 || '').trim()
  const 直接 = 查表(原名)
  if (直接) return 直接

  // 收集所有能用的名字
  const 全部 = []
  for (const 类别 of ['表情', '动画', '语音']) {
    for (const 名 of Object.keys(表情表[类别] || {})) 全部.push({ 名, 类别 })
  }

  // 谁包含谁：她写的字里有表里的名字，或者表里的名字里有她写的字
  const 候选 = 全部
    .filter(({ 名 }) => 原名.includes(名) || 名.includes(原名))
    .sort((a, b) => Math.abs(a.名.length - 原名.length) - Math.abs(b.名.length - 原名.length))

  if (候选.length) {
    const 中的 = 候选[0]
    const 找到 = 查表(中的.名)
    if (找到) return { ...找到, 猜测: true, 她写的是: 原名, 名字: 中的.名 }
  }

  // 再退一步：按"共用了几个字"来打分。
  // 实测样本：她写"眯脉"，想说的是"眯眯眼" —— 共用「眯」，而且长度接近。
  // 两个条件同时满足才算：共用的字够多，长度也差不多（免得"星星眼"被认成别的）。
  if (原名.length >= 2) {
    const 候选2 = 全部
      .map(({ 名, 类别 }) => ({
        名,
        类别,
        共用: [...new Set(原名)].filter((字) => 名.includes(字)).length,
        长度差: Math.abs(名.length - 原名.length),
      }))
      .filter((x) => x.共用 >= 2 && x.长度差 <= 1)
      .sort((a, b) => b.共用 - a.共用 || a.长度差 - b.长度差)

    if (候选2.length) {
      const 中的 = 候选2[0]
      const 找到 = 查表(中的.名)
      if (找到) return { ...找到, 猜测: true, 她写的是: 原名, 名字: 中的.名 }
    }
  }

  return null
}

/**
 * 让她做个表情或者动作
 *
 * 会自动挑通道：先试"直接按键"，不行就"写队列文件"。
 * 名字认不出来的时候会**猜一下**（她偶尔会写错字，见 大概查表）。
 *
 * @param {string} 名字 中文名（如"妖精小姐"）或快捷键（如"Q"）
 * @returns {{成功: boolean, 通道: string, 说明: string}}
 */
function 做表情(名字) {
  const 找到 = 大概查表(名字)
  if (!找到) {
    const 说明 = `不认识「${名字}」—— 跑 "node tools/bridge.cjs 列表" 看有哪些`
    console.log('✗ ' + 说明)
    return { 成功: false, 通道: '无', 说明 }
  }

  const 显示名 = 找到.名字 || 名字
  if (找到.猜测) {
    console.log(`  （她写的是「${找到.她写的是}」，我按「${显示名}」来做了）`)
  }

  // 通道一：直接按键
  try {
    按Alt加键(找到.键)
    const 说明 = `${找到.类别}：${显示名}  (Alt+${找到.键}) —— 直接发出`
    console.log('✓ ' + 说明)
    return { 成功: true, 通道: '直接按键', 说明 }
  } catch (err) {
    // 通道二：写队列（给沙箱环境用）
    try {
      写进队列(显示名)
      const 说明 = `${找到.类别}：${显示名}  —— 已写进队列，等桌宠服务（pet-service）执行`
      console.log('✓ ' + 说明)
      console.log('  （通道一不可用：' + (err.code || err.message) + '）')
      return { 成功: true, 通道: '队列', 说明 }
    } catch (err2) {
      const 说明 = `两条通道都失败了：${err.message} / ${err2.message}`
      console.log('✗ ' + 说明)
      return { 成功: false, 通道: '无', 说明 }
    }
  }
}

// ============================================================
// 命令行用法
// ============================================================
if (require.main === module) {
  const 参数 = process.argv[2]

  if (!参数 || 参数 === '列表') {
    console.log('')
    console.log('=== 她能做的表情和动作 ===')
    console.log('')
    for (const 类别 of ['表情', '动画', '语音']) {
      console.log(`【${类别}】`)
      for (const [名, 键] of Object.entries(表情表[类别] || {})) {
        console.log(`  ${名.padEnd(14)} Alt+${键}`)
      }
      console.log('')
    }
    console.log('用法: node tools/bridge.cjs <名字>')
    console.log('例:   node tools/bridge.cjs 妖精小姐')
    console.log('')
  } else {
    做表情(参数)
  }
}

module.exports = { 做表情, 查表, 大概查表, 按Alt加键, 写进队列, 表情表, 队列路径 }
