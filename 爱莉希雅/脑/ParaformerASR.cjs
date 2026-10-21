/** 旧 Paraformer Large 驱动：保留作手动回退，不再作为默认方案。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')

const 根 = 配置.ASR根
const Python = path.join(根, 'runtime', 'python.exe')
const Worker = path.join(__dirname, 'funasr_worker.py')
const 模型目录 = path.join(根, 'tools', 'asr', 'models')
const 必需模型 = [
  'speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch',
  'speech_fsmn_vad_zh-cn-16k-common-pytorch',
  'punc_ct-transformer_zh-cn-common-vocab272727-pytorch',
]
const 空闲退出毫秒 = 60 * 1000

let 子进程 = null
let 就绪承诺 = null
let 就绪 = false
let 启动信息 = null
let 行缓冲 = ''
let 空闲钟 = null
const 等待们 = new Map()

function 配置问题() {
  if (!fs.existsSync(Python)) return `找不到 ASR Python：${Python}`
  for (const 名字 of 必需模型) {
    if (!fs.existsSync(path.join(模型目录, 名字))) return `缺少 ASR 模型：${名字}`
  }
  return ''
}

function 清空等待(说明) {
  for (const [, 项] of 等待们) 项.resolve({ 成功: false, 说明 })
  等待们.clear()
}

function 停止() {
  if (空闲钟) clearTimeout(空闲钟)
  空闲钟 = null
  if (子进程 && !子进程.killed) 子进程.kill()
  子进程 = null
  就绪承诺 = null
  就绪 = false
  启动信息 = null
  行缓冲 = ''
  清空等待('语音识别进程已停止')
}

function 延后退出() {
  if (空闲钟) clearTimeout(空闲钟)
  空闲钟 = setTimeout(() => {
    if (!等待们.size) 停止()
  }, 空闲退出毫秒)
  空闲钟.unref?.()
}

function 处理消息(消息, readyResolve, readyReject) {
  if (消息.type === 'ready') {
    就绪 = true
    启动信息 = 消息
    readyResolve(消息)
    return
  }
  if (消息.type === 'fatal') {
    readyReject(new Error(消息.error || 'ASR 初始化失败'))
    return
  }
  if (消息.type !== 'result') return
  const 项 = 等待们.get(String(消息.id))
  if (!项) return
  等待们.delete(String(消息.id))
  项.cleanup()
  项.resolve(消息.ok
    ? { 成功: true, 文字: 消息.text, 语言: 'zh', 用时: Number(消息.seconds) || 0, 内存MB: Number(消息.memoryMB) || 0 }
    : { 成功: false, 说明: 消息.error || '本地模型没有识别出文字' })
  延后退出()
}

async function 启动() {
  if (就绪 && 子进程) return 启动信息
  if (就绪承诺) return 就绪承诺
  const 问题 = 配置问题()
  if (问题) throw new Error(问题)
  就绪承诺 = new Promise((resolve, reject) => {
    let settled = false
    let 计时 = null
    const 成功 = (值) => { if (!settled) { settled = true; clearTimeout(计时); resolve(值) } }
    const 失败 = (错误) => { if (!settled) { settled = true; clearTimeout(计时); reject(错误) } }
    计时 = setTimeout(() => 失败(new Error('ASR 模型加载超时')), 180000)
    子进程 = spawn(Python, ['-u', Worker, 根, 配置.ASR设备], {
      cwd: 根,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1' },
    })
    子进程.stdout.setEncoding('utf8')
    子进程.stdout.on('data', (块) => {
      行缓冲 += 块
      for (;;) {
        const 位置 = 行缓冲.indexOf('\n')
        if (位置 < 0) break
        const 行 = 行缓冲.slice(0, 位置).trim()
        行缓冲 = 行缓冲.slice(位置 + 1)
        if (!行) continue
        try { 处理消息(JSON.parse(行), 成功, 失败) } catch (错误) { 失败(new Error('ASR 协议错误：' + 错误.message)) }
      }
    })
    let 错误尾巴 = ''
    子进程.stderr.setEncoding('utf8')
    子进程.stderr.on('data', (块) => { 错误尾巴 = (错误尾巴 + 块).slice(-1200) })
    子进程.once('error', 失败)
    子进程.once('exit', (code) => {
      clearTimeout(计时)
      const 原因 = `ASR 进程退出（${code == null ? '未知' : code}）：${错误尾巴.trim().slice(-500)}`
      if (!就绪) 失败(new Error(原因))
      子进程 = null
      就绪承诺 = null
      就绪 = false
      启动信息 = null
      清空等待(原因)
    })
  })
  就绪承诺.then(() => { 延后退出() }, () => { 停止() })
  return 就绪承诺
}

async function status() {
  const 问题 = 配置问题()
  if (问题) return { 在: false, 已配置: false, 说明: 问题 }
  if (就绪 && 子进程) return { 在: true, 已配置: true, 说明: `本地 FunASR 已加载（${配置.ASR设备}，约 ${启动信息?.memoryMB || '?'} MB）` }
  return { 在: true, 已配置: true, 说明: `本地 FunASR 已配置，首次录音时加载（${配置.ASR设备}）` }
}

async function transcribe(音频, { 类型 = 'audio/wav', 中止 } = {}) {
  if (!/^(audio\/wav|audio\/x-wav)$/i.test(类型)) return { 成功: false, 说明: '当前本地识别驱动只接收 WAV 录音' }
  if (中止?.aborted) return { 成功: false, 已取消: true, 说明: '语音识别已取消' }
  try { await 启动() } catch (错误) { return { 成功: false, 说明: 错误.message } }
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
      const 项 = 等待们.get(id)
      if (!项) return
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

module.exports = { id: 'paraformer-legacy', status, transcribe, stop: 停止, paths: { 根, Python, Worker, 模型目录 } }
