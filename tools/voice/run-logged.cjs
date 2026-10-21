/**
 * run-logged.cjs -- 跑一个命令，把它的输出同时显示出来、又写进日志
 *
 * 【为什么不用 cmd 或 PowerShell 做这件事】
 *   想把一个程序的输出"一边显示一边存文件"，cmd 自己没有这个功能。
 *   试过两条路，都不行：
 *     · cmd 的 `> 日志` —— 能存，但屏幕上看不见了，加载进度就没了
 *     · PowerShell 的 Tee-Object —— 想法对，可夹在 .cmd 里的时候
 *       引号会打结，报 "Tee-Object is not recognized"（实测过）
 *   而且 PowerShell 写文件默认编码是 UTF-16/GBK 那一套，
 *   混杂的中英文输出容易乱码。
 *
 *   Node 就没这些问题：读写文件天然 UTF-8，中文英文都对；
 *   而且它本来就在这台机器上（她的程序就是 Node 跑的）。
 *
 * 【怎么用】
 *   node run-logged.cjs <日志文件> <程序> [参数...]
 *
 *   例：
 *   node run-logged.cjs D:\GPT-SoVITS\voice.log D:\GPT-SoVITS\runtime\python.exe -u api_v2.py
 *
 * 【它会一直守着】
 *   被启动的程序活着，它就活着；那程序输出一行，它转一行。
 *   所以别指望它自己退出 —— 声音服务是一直跑着的。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const [日志文件, 程序, ...参数] = process.argv.slice(2)

if (!日志文件 || !程序) {
  console.error('用法: node run-logged.cjs <日志文件> <程序> [参数...]')
  process.exit(2)
}

// 日志目录先建出来
try {
  fs.mkdirSync(path.dirname(日志文件), { recursive: true })
} catch {
  /* 目录已经在了 */
}

// 开一个"追加写"的输出流 —— 追加而不是覆盖，这样重启服务不会把上次的日志洗掉
const 记录 = fs.createWriteStream(日志文件, { flags: 'a', encoding: 'utf8' })

function 写(前缀, 块) {
  const 文本 = 块.toString('utf8')
  // 屏幕上带个前缀（看得出是谁在说话）
  process.stdout.write(文本)
  // 文件里带时间戳，事后好查
  const 补 = (n) => String(n).padStart(2, '0')
  const d = new Date()
  const 时间 = `${d.getFullYear()}-${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`
  for (const 行 of 文本.split('\n')) {
    if (!行.trim()) continue
    记录.write(`[${时间}] ${前缀}${行}\n`)
  }
}

记录.write(`\n===== ${new Date().toLocaleString('zh-CN')} 启动 =====\n`)
记录.write(`命令: ${程序} ${参数.join(' ')}\n\n`)

const 子进程 = spawn(程序, 参数, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

子进程.stdout.on('data', (块) => 写('', 块))
子进程.stderr.on('data', (块) => 写('[错误] ', 块))

子进程.on('error', (错误) => {
  const 行 = `启动失败: ${错误.message}\n`
  process.stderr.write(行)
  记录.write(行)
  记录.end()
  process.exit(1)
})

子进程.on('exit', (码) => {
  const 行 = `\n===== 程序退出（退出码 ${码}）=====\n`
  process.stdout.write(行)
  记录.write(行)
  记录.end()
  process.exit(码 === null ? 1 : 码)
})

// Ctrl+C 的时候把它也带走，别留下孤儿进程
for (const 信号 of ['SIGINT', 'SIGTERM']) {
  process.on(信号, () => {
    try {
      子进程.kill()
    } catch {
      /* 已经没了 */
    }
    记录.end()
    process.exit(0)
  })
}
