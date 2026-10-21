/** SenseVoiceSmall INT8 驱动：按需启动独立 Node 进程，空闲一分钟释放内存。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const 配置 = require('./配置.cjs')

const 根 = 配置.SenseVoice根
const Worker = path.join(__dirname, 'sensevoice_worker.cjs')
const 模型 = path.join(根, 'model', 'model.int8.onnx')
const Tokens = path.join(根, 'model', 'tokens.txt')
const 模块 = path.join(根, 'runtime', 'node_modules', 'sherpa-onnx-node', 'package.json')
const 平台模块 = path.join(根, 'runtime', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx.node')
const 空闲退出毫秒 = 60 * 1000
// sherpa-onnx-node 的原生模块按 Node ABI 发布，不能直接装进 Electron 进程。
// 开发态本来就是 Node；应用态则用 PATH 中的系统 Node 启动隔离进程。
const Node命令 = process.versions.electron
  ? (process.env.ELYSIA_NODE_EXE || 'node.exe')
  : process.execPath

let 子进程 = null
let 就绪承诺 = null
let 就绪信息 = null
let 行缓冲 = ''
let 空闲钟 = null
const 等待们 = new Map()

function 配置问题() {
  for (const [名字, 文件] of [['INT8 模型', 模型], ['词表', Tokens], ['Node 模块', 模块], ['Windows x64 模块', 平台模块]]) {
    if (!fs.existsSync(文件)) return `缺少 SenseVoice ${名字}：${文件}`
  }
  return ''
}

function 可用() { return !配置问题() }

function 清空等待(说明) {
  for (const [, 项] of 等待们) {
    项.cleanup()
    项.resolve({ 成功: false, 说明 })
  }
  等待们.clear()
}

function 停止() {
  clearTimeout(空闲钟)
  空闲钟 = null
  const 旧进程 = 子进程
  子进程 = null
  就绪承诺 = null
  就绪信息 = null
  行缓冲 = ''
  if (旧进程 && !旧进程.killed) 旧进程.kill()
  清空等待('语音识别进程已停止')
}

function 延后退出() {
  clearTimeout(空闲钟)
  空闲钟 = setTimeout(() => { if (!等待们.size) 停止() }, 空闲退出毫秒)
  空闲钟.unref?.()
}

function 处理消息(消息, 成功, 失败) {
  if (消息.type === 'ready') {
    就绪信息 = 消息
    成功(消息)
    return
  }
  if (消息.type === 'fatal') {
    失败(new Error(消息.error || 'SenseVoice 初始化失败'))
    return
  }
  if (消息.type !== 'result') return
  const 项 = 等待们.get(String(消息.id))
  if (!项) return
  等待们.delete(String(消息.id))
  项.cleanup()
  项.resolve(消息.ok
    ? { 成功: true, 文字: 消息.text, 语言: 'zh', 用时: Number(消息.seconds) || 0, 内存MB: Number(消息.memoryMB) || 0 }
    : { 成功: false, 说明: 消息.error || 'SenseVoice 没有识别出文字' })
  延后退出()
}

async function 启动() {
  if (子进程 && 就绪信息) return 就绪信息
  if (就绪承诺) return 就绪承诺
  const 问题 = 配置问题()
  if (问题) throw new Error(问题)
  就绪承诺 = new Promise((resolve, reject) => {
    let settled = false
    let 计时 = null
    const 成功 = (值) => { if (!settled) { settled = true; clearTimeout(计时); resolve(值) } }
    const 失败 = (错误) => { if (!settled) { settled = true; clearTimeout(计时); reject(错误) } }
    计时 = setTimeout(() => 失败(new Error('SenseVoice 模型加载超时')), 30000)
    const 此进程 = spawn(Node命令, [Worker, 根], {
      cwd: path.dirname(Worker),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    子进程 = 此进程
    此进程.stdout.setEncoding('utf8')
    此进程.stdout.on('data', (块) => {
      行缓冲 += 块
      for (;;) {
        const 位置 = 行缓冲.indexOf('\n')
        if (位置 < 0) break
        const 行 = 行缓冲.slice(0, 位置).trim()
        行缓冲 = 行缓冲.slice(位置 + 1)
        if (!行) continue
        try { 处理消息(JSON.parse(行), 成功, 失败) } catch (错误) { 失败(new Error('SenseVoice 协议错误：' + 错误.message)) }
      }
    })
    let 错误尾巴 = ''
    此进程.stderr.setEncoding('utf8')
    此进程.stderr.on('data', (块) => { 错误尾巴 = (错误尾巴 + 块).slice(-1200) })
    此进程.once('error', 失败)
    此进程.once('exit', (code) => {
      if (子进程 !== 此进程) return
      const 原因 = `SenseVoice 进程退出（${code == null ? '未知' : code}）：${错误尾巴.trim().slice(-500)}`
      if (!就绪信息) 失败(new Error(原因))
      子进程 = null
      就绪承诺 = null
      就绪信息 = null
      清空等待(原因)
    })
  })
  就绪承诺.then(() => 延后退出(), () => 停止())
  return 就绪承诺
}

async function status() {
  const 问题 = 配置问题()
  if (问题) return { 在: false, 已配置: false, 说明: 问题 }
  if (子进程 && 就绪信息) return { 在: true, 已配置: true, 说明: `SenseVoice 已加载（约 ${就绪信息.memoryMB || '?'} MB）` }
  return { 在: true, 已配置: true, 说明: 'SenseVoice 已配置，首次录音时加载' }
}

async function transcribe(音频, { 类型 = 'audio/wav', 中止 } = {}) {
  if (!/^(audio\/wav|audio\/x-wav)$/i.test(类型)) return { 成功: false, 说明: 'SenseVoice 当前只接收 WAV 录音' }
  if (中止?.aborted) {
    if (!等待们.size) 停止()
    return { 成功: false, 已取消: true, 说明: '语音识别已取消' }
  }
  try { await 启动() } catch (错误) { return { 成功: false, 说明: 错误.message } }
  if (中止?.aborted) {
    if (!等待们.size) 停止()
    return { 成功: false, 已取消: true, 说明: '语音识别已取消' }
  }
  const id = crypto.randomUUID()
  const 目录 = path.join(配置.缓存目录, 'asr')
  fs.mkdirSync(目录, { recursive: true })
  const 文件 = path.join(目录, id + '.wav')
  fs.writeFileSync(文件, 音频)
  return new Promise((resolve) => {
    const cleanup = () => {
      中止?.removeEventListener?.('abort', 取消)
      try { fs.unlinkSync(文件) } catch {}
    }
    const 取消 = () => {
      if (!等待们.has(id)) return
      等待们.delete(id)
      cleanup()
      resolve({ 成功: false, 已取消: true, 说明: '语音识别已取消' })
      if (!等待们.size) 停止()
    }
    等待们.set(id, { resolve, cleanup })
    中止?.addEventListener?.('abort', 取消, { once: true })
    try {
      子进程.stdin.write(JSON.stringify({ id, path: 文件 }) + '\n')
    } catch (错误) {
      等待们.delete(id)
      cleanup()
      resolve({ 成功: false, 说明: '无法发送录音：' + 错误.message })
    }
  })
}

module.exports = { id: 'sensevoice-local', status, transcribe, stop: 停止, 可用, paths: { 根, Worker, 模型, Tokens, 模块, 平台模块 }, diagnostics: () => ({ running: !!子进程, ready: !!就绪信息, pid: 子进程?.pid || 0, node: Node命令 }) }
