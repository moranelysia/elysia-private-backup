/**
 * 试命令.cjs —— 跑一条外部命令，把它的输出拿回来
 *
 * 【为什么不直接用 execFileSync —— 这个是给"被沙箱关着"的环境用的】
 *
 *   2026-10-01 晚上量的（四种接法各试一次，gcc --version）：
 *     stdio 默认(pipe)     → 错了：EPERM
 *     stdio:'ignore'       → 成了（但拿不到输出）
 *     stdio:'inherit'      → 成了（输出直接打到屏幕上，也拿不回来）
 *     stdio=[ignore, fd, fd]（重定向到文件）→ **成了，而且输出拿得到**
 *
 *   为什么：DSH 的沙箱不让进程开**命名管道**，而 Node 在 Windows 上
 *   就是用命名管道来接子进程输出的。所以 `execFileSync('gcc', ...)`
 *   这种最自然的写法，在沙箱里一律 EPERM ——
 *   不是 gcc 有问题，也不是命令写错了，是**接输出那根管子不让接**。
 *   改成写到文件就没这个限制（文件句柄不是命名管道）。
 *
 *   PowerShell 自己的管道不受影响，所以在终端里手敲 gcc 是好的 ——
 *   这也是为什么"你那边明明能编，我这边编不了"。
 *
 * 【什么时候该用它】
 *   测试脚本里凡是"要跑个外部命令、还要看它说了什么"的地方，
 *   用它就对了：在沙箱里能跑，在他终端里也能跑，两边行为一样。
 *   （产品代码 —— 脑\工具\命令工具.cjs —— 不用这个：她是在他机器上
 *     真跑的，那儿没有沙箱，正常管道就行。）
 *
 * 用法:
 *   const { 试 } = require('./试命令.cjs')
 *   const r = 试('gcc', ['--version'])
 *   r.好 / r.出 / r.状态 / r.拦住了
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

let 序号 = 0

/**
 * @param {string} 命令
 * @param {string[]} 参数
 * @param {object} [选项]  跟 spawnSync 的一样（cwd、timeout、env…）
 * @returns {{好:boolean, 出:string, 状态:number|null, 拦住了?:boolean, 超时?:boolean}}
 */
function 试(命令, 参数 = [], 选项 = {}) {
  // 临时文件放在系统临时目录（沙箱允许），拿不到就退回当前目录
  let 临时目录 = os.tmpdir()
  try {
    fs.accessSync(临时目录, fs.constants.W_OK)
  } catch {
    临时目录 = process.cwd()
  }
  const 临时 = path.join(临时目录, `elysia-试-${process.pid}-${序号++}.log`)

  let fd = null
  try {
    fd = fs.openSync(临时, 'w')
    const 果 = spawnSync(命令, 参数, {
      timeout: 60000,
      windowsHide: true,
      ...选项,
      // 这一行是关键：不用管道，直接写进文件
      stdio: ['ignore', fd, fd],
    })
    fs.closeSync(fd)
    fd = null

    const 出 = fs.readFileSync(临时, 'utf8')

    if (果.error) {
      const 码 = 果.error.code || ''
      if (码 === 'EPERM' || 码 === 'EACCES') return { 好: false, 出, 状态: null, 拦住了: true }
      return { 好: false, 出: 出 || String(果.error.message), 状态: null }
    }

    // timeout 杀掉的时候 status 是 null、signal 有值
    if (果.signal) {
      return { 好: false, 出: 出 + `\n（被杀掉了：${果.signal}）`, 状态: null, 超时: 果.signal === 'SIGTERM' }
    }

    return { 好: 果.status === 0, 出, 状态: 果.status }
  } catch (错误) {
    const 码 = 错误.code || ''
    return {
      好: false,
      出: String(错误.message),
      状态: null,
      拦住了: 码 === 'EPERM' || 码 === 'EACCES',
    }
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        /* 关不上就算了 */
      }
    }
    try {
      fs.rmSync(临时, { force: true })
    } catch {
      /* 删不掉就算了，是系统临时目录 */
    }
  }
}

module.exports = { 试 }
