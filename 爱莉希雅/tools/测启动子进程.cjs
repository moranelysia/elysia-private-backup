/**
 * 测启动子进程.cjs —— 她（Electron）到底能不能启动另一个 node 脚本
 *
 * 【为什么非测这一下】
 *   "全部关掉"是让她去启动 tools\全部关掉.cjs 来收摊的。
 *   他点了之后日志里只有一句「收摊脚本超时了」—— 说明那个脚本
 *   **根本没跑完**（12 秒兜底把它踢了），可脚本自己单独跑只要 0.1 秒。
 *
 *   差别在哪儿？只在"谁启动它"。
 *   所以必须单独测这一件事：**从 Electron 的主进程里 spawn 一个 node，
 *   它到底起不起得来、输出传不传得出来。**
 *
 *   这个坑我今天已经踩过一次了（写了个没验证的收摊脚本），
 *   所以这次先测再改。
 *
 * 【怎么测】
 *   自己起一个最小 Electron 窗口（不加载她的界面），
 *   在主进程里启动一个脚本，把结果写进文件，然后退出。
 *   跑完看那个文件。
 *
 * 用法: node tools\测启动子进程.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const 项目根 = path.resolve(__dirname, '..')
const electron = path.join(项目根, 'node_modules', 'electron', 'dist', 'electron.exe')
const 结果文件 = path.join(项目根, '.cache', '测启动子进程的结果.txt')

if (!fs.existsSync(electron)) {
  console.log('  ✗ 找不到 electron.exe')
  process.exit(1)
}

// 临时生成一个最小的 Electron 主程序：它只做一件事 —— 启动一个子进程并记下结果
const 临时主程序 = path.join(项目根, '.cache', '测子进程用的小主程序.js')
fs.mkdirSync(path.dirname(临时主程序), { recursive: true })
fs.writeFileSync(
  临时主程序,
  `
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')

const 项目根 = ${JSON.stringify(项目根)}
const 结果文件 = ${JSON.stringify(结果文件)}

function 记(行) {
  fs.appendFileSync(结果文件, 行 + '\\n', 'utf8')
}

app.whenReady().then(async () => {
  记('')
  记('=== 从 Electron 主进程里启动子进程 ===')
  记('electron 版本: ' + process.versions.electron + '   node: ' + process.versions.node)
  记('process.execPath: ' + process.execPath)
  记('')

  // ---- 测试一：直接启动 node ----
  // 【关键问题】在 Electron 里 process.execPath 指的是 **electron.exe**，
  // 不是 node.exe。用它去跑一个 .js，Electron 会当成"要打开一个 app"，
  // 多半起不来或者挂在那儿 —— 这是我最怀疑的一点。
  const 开始1 = Date.now()
  const 结果1 = await new Promise((完成) => {
    let 出 = ''
    let 错了 = ''
    const 子 = spawn(process.execPath, ['-e', 'console.log("子进程活着")'], { stdio: ['ignore', 'pipe', 'pipe'] })
    const 闹钟 = setTimeout(() => { 子.kill(); 完成({ 超时: true, 出, 错了 }) }, 8000)
    子.stdout.on('data', (d) => { 出 += d.toString() })
    子.stderr.on('data', (d) => { 错了 += d.toString() })
    子.on('error', (e) => { clearTimeout(闹钟); 完成({ 报错: e.message, 出, 错了 }) })
    子.on('exit', (码) => { clearTimeout(闹钟); 完成({ 码, 出, 错了 }) })
  })
  记('测试一：用 process.execPath 启动（这正是现在代码里的做法）')
  记('  用时 ' + ((Date.now() - 开始1) / 1000).toFixed(1) + 's')
  记('  ' + JSON.stringify(结果1).slice(0, 300))
  记('')

  // ---- 测试二：真去跑那个收摊脚本 ----
  const 开始2 = Date.now()
  const 结果2 = await new Promise((完成) => {
    let 出 = ''
    let 错了 = ''
    const 子 = spawn(process.execPath, [path.join(项目根, 'tools', '全部关掉.cjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
    const 闹钟 = setTimeout(() => { 子.kill(); 完成({ 超时: true, 出: 出.slice(0, 400), 错了: 错了.slice(0, 400) }) }, 20000)
    子.stdout.on('data', (d) => { 出 += d.toString() })
    子.stderr.on('data', (d) => { 错了 += d.toString() })
    子.on('error', (e) => { clearTimeout(闹钟); 完成({ 报错: e.message }) })
    子.on('exit', (码) => { clearTimeout(闹钟); 完成({ 码, 出: 出.slice(0, 400), 错了: 错了.slice(0, 400) }) })
  })
  记('测试二：真跑一遍 全部关掉.cjs')
  记('  用时 ' + ((Date.now() - 开始2) / 1000).toFixed(1) + 's')
  记('  ' + JSON.stringify(结果2).slice(0, 600))
  记('')

  // ---- 测试三：换个办法 —— 用 cmd 去启动（中间垫一层）----
  const 开始3 = Date.now()
  const 结果3 = await new Promise((完成) => {
    let 出 = ''
    let 错了 = ''
    const 子 = spawn('cmd', ['/c', 'node', path.join(项目根, 'tools', '全部关掉.cjs')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: 项目根,
    })
    const 闹钟 = setTimeout(() => { 子.kill(); 完成({ 超时: true, 出: 出.slice(0, 400), 错了: 错了.slice(0, 400) }) }, 20000)
    子.stdout.on('data', (d) => { 出 += d.toString() })
    子.stderr.on('data', (d) => { 错了 += d.toString() })
    子.on('error', (e) => { clearTimeout(闹钟); 完成({ 报错: e.message }) })
    子.on('exit', (码) => { clearTimeout(闹钟); 完成({ 码, 出: 出.slice(0, 400), 错了: 错了.slice(0, 400) }) })
  })
  记('测试三：用 cmd /c node 启动（中间垫一层）')
  记('  用时 ' + ((Date.now() - 开始3) / 1000).toFixed(1) + 's')
  记('  ' + JSON.stringify(结果3).slice(0, 600))
  记('')
  记('=== 测完了 ===')

  app.quit()
})
`,
  'utf8',
)

fs.mkdirSync(path.dirname(结果文件), { recursive: true })
fs.writeFileSync(结果文件, '', 'utf8')

console.log('')
console.log('  从 Electron 里试三种启动子进程的办法，结果写进：')
console.log('    ' + 结果文件)
console.log('')

const 子 = spawn(electron, [临时主程序], {
  cwd: 项目根,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
})

let 它的输出 = ''
子.stdout.on('data', (d) => {
  它的输出 += d.toString()
})
子.stderr.on('data', (d) => {
  它的输出 += d.toString()
})

子.on('error', (错误) => {
  console.log('  ✗ Electron 没起来: ' + 错误.message)
})

子.on('exit', () => {
  console.log('  Electron 退出了。结果：')
  console.log('')
  try {
    console.log(fs.readFileSync(结果文件, 'utf8'))
  } catch {
    console.log('  （结果文件是空的 —— 说明那个小主程序压根没跑起来）')
    if (它的输出.trim()) {
      console.log('  Electron 自己的输出：')
      console.log(它的输出.split('\n').slice(0, 20).join('\n'))
    }
  }
})
