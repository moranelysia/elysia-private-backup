/**
 * 看账本.cjs —— 把「账本」小面板单独打开看一眼（用假数字）
 *
 * 【为什么要这么个东西】
 *   调外观的时候不该真去跟她说话 —— 那要花钱，还慢。
 *   这个脚本直接把面板打开，里面填的是一组像样的假数字，
 *   看完关掉就行，一分钱不花。
 *
 * 顺便它也是"面板长什么样"的说明书：你要是觉得字太小、
 * 想换成显示"元"、想加一项"这个月花了多少"，
 * 改 renderer\账本.js（填数字）和 renderer\账本.css（长相）就行。
 *
 * 用法: node tools\看账本.cjs
 *      （会弹出一个 208x236 的小窗，关掉它窗口就退出了）
 */
'use strict'

const path = require('node:path')
const { spawn } = require('node:child_process')

const 项目根 = path.resolve(__dirname, '..')
const electron = path.join(项目根, 'node_modules', 'electron', 'dist', 'electron.exe')

console.log('')
console.log('  打开账本面板（假数字，不花钱）')
console.log('')

if (!require('node:fs').existsSync(electron)) {
  console.log('  ✗ 找不到 electron.exe —— 先在项目文件夹里跑一次 npm install')
  process.exit(1)
}

// 用一个临时的小主程序打开它，而不是走 main.js ——
// 不然会把"她本人"也一起启动了，那就不是"看一眼面板"了。
const 临时主程序 = path.join(项目根, '.cache', '只看账本.js')
require('node:fs').mkdirSync(path.dirname(临时主程序), { recursive: true })
require('node:fs').writeFileSync(
  临时主程序,
  `// 自动生成的临时文件：只为了让「账本」面板单独露面看一眼。
// 用完可以删，下次跑 tools\\看账本.cjs 会再生成。
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
app.whenReady().then(() => {
  const w = new BrowserWindow({
    width: 208,
    height: 236,
    minWidth: 208,
    maxWidth: 208,
    minHeight: 236,
    maxHeight: 236,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    title: '账本（试看）',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  w.on('will-resize', (event) => event.preventDefault())
  w.loadFile(path.join(${JSON.stringify(项目根)}, 'renderer', '账本.html'), { query: { 试看: '1' } })
  w.on('closed', () => app.quit())
})
`,
  'utf8',
)

// preload 里用了 ipcRenderer，这个临时窗口没接对讲机 ——
// 所以试看模式下页面不会去问主进程要数字（见 账本.js 里那段判断）
const 子进程 = spawn(electron, [临时主程序, '--试看'], {
  cwd: 项目根,
  stdio: 'ignore',
  detached: false,
})

子进程.on('error', (错误) => {
  console.log('  ✗ 没打开: ' + 错误.message)
  process.exit(1)
})

子进程.on('exit', () => {
  console.log('  关掉了。')
  console.log('')
})
