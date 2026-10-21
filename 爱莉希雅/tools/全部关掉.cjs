/**
 * 全部关掉.cjs —— 手动收摊（命令行用）
 *
 * 【它现在很薄，是故意的】
 *   收摊的逻辑在 脑\收摊.cjs 里 —— 因为主程序（托盘菜单"全部关掉"）
 *   也要用同一套。写两份早晚会不一致。
 *
 *   这个文件只是"让我能从命令行手动跑一遍"的入口：
 *       node tools\全部关掉.cjs
 *   他要是想手动收摊、又懒得点托盘，就用这个。
 *
 * 【历史上这里是主实现，改过两次，都是因为没验证】
 *   第一次：先问全量进程清单（WMI，好几秒）再杀 —— 慢。
 *   第二次：主程序 spawn(electron.exe, ['全部关掉.cjs']) 来调它 ——
 *           **卡死**。因为 Electron 里 process.execPath 是 electron.exe，
 *           拿 .js 去启动它等于又开一个 Electron，被"只允许开一个"挡住，
 *           谁也不退（他点了之后 12 秒自己退出，什么都没关掉）。
 *   现在：主程序直接调 脑\收摊.cjs 里的函数，不绕子进程。
 */
'use strict'

const path = require('node:path')
const { 收摊 } = require(path.join(__dirname, '..', '脑', '收摊.cjs'))

const 开始 = Date.now()

console.log('')
console.log('  ============================================')
console.log('   把爱莉希雅这一套全部关掉')
console.log('  ============================================')
console.log('')

const 结果 = 收摊((行) => console.log('  ✓ ' + 行))

console.log('')
console.log(`  收摊完成（用时 ${((Date.now() - 开始) / 1000).toFixed(1)}s）`)
console.log('')
console.log('  （那两个声音窗口会自己消失；万一没消失，手动点掉它们。）')
console.log('')
