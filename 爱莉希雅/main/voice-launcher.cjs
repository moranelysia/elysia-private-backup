/**
 * voice-launcher.cjs —— 从爱莉希雅界面无窗口启动声音服务。
 *
 * 不调用 start-voice-only.cmd：那个脚本故意用 `start cmd /k` 打开两个终端，
 * 适合人工排错，不适合日常按钮。这里直接启动原来的 run-logged 看门狗，
 * GPT-SoVITS 与 bridge 都隐藏运行，输出仍写入 D:\GPT-SoVITS 的日志。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

function 创建声音启动器({ 工作区根, 配置文件, 状态, 启动进程 = spawn, 现在 = () => Date.now(), 保护毫秒 = 5 * 60 * 1000 }) {
  const 根 = path.resolve(String(工作区根 || ''))
  const 配置路径 = path.resolve(String(配置文件 || ''))
  if (typeof 状态 !== 'function') throw new Error('声音启动器缺少状态检查')
  let 保护到 = 0

  function 路径们() {
    const voice = JSON.parse(fs.readFileSync(配置路径, 'utf8'))
    const ffmpeg = path.resolve(String(voice.ffmpeg || ''))
    const 声音目录 = path.dirname(path.dirname(ffmpeg))
    return {
      声音目录,
      python: path.join(声音目录, 'runtime', 'python.exe'),
      看门狗: path.join(根, 'tools', 'voice', 'run-logged.cjs'),
      转接层: path.join(根, 'tools', 'voice', 'tts-bridge.cjs'),
      本体日志: path.join(声音目录, 'elysia-voice-9880.log'),
      转接日志: path.join(声音目录, 'elysia-voice-9881.log'),
    }
  }

  function 后台拉起({ 日志, 程序, 参数, 工作目录, 自带运行时 }, p) {
    const 环境 = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PATH: 自带运行时 ? 自带运行时 + ';' + (process.env.PATH || '') : process.env.PATH,
    }
    return 启动进程(process.execPath, [p.看门狗, 日志, 程序, ...参数], {
      cwd: 工作目录,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      env: 环境,
    })
  }

  async function 启动() {
    const 当前 = await 状态(1200)
    if (当前 && 当前.在) {
      return { 成功: true, 已就绪: true, 正在加载: false, 说明: '声音服务已经在线' }
    }
    if (现在() < 保护到) {
      return { 成功: true, 已就绪: false, 正在加载: true, 说明: '声音服务正在后台加载，请稍等' }
    }

    let p
    try {
      p = 路径们()
    } catch (错误) {
      return { 成功: false, 说明: '读不到声音配置：' + 错误.message }
    }
    for (const [名字, 文件] of [['GPT-SoVITS', p.python], ['声音看门狗', p.看门狗], ['声音转接层', p.转接层]]) {
      if (!fs.existsSync(文件)) return { 成功: false, 说明: `找不到${名字}：${文件}` }
    }

    const 子进程们 = []
    try {
      子进程们.push(后台拉起({
        日志: p.本体日志,
        程序: p.python,
        参数: ['-u', 'api_v2.py', '-a', '127.0.0.1', '-p', '9880', '-c', 'GPT_SoVITS\\configs\\tts_infer.yaml'],
        工作目录: p.声音目录,
        自带运行时: path.join(p.声音目录, 'runtime'),
      }, p))
      子进程们.push(后台拉起({
        日志: p.转接日志,
        程序: process.execPath,
        参数: [p.转接层],
        工作目录: 根,
        自带运行时: '',
      }, p))
    } catch (错误) {
      return { 成功: false, 说明: '声音启动失败：' + 错误.message }
    }

    for (const 子进程 of 子进程们) {
      if (typeof 子进程.unref === 'function') 子进程.unref()
      子进程.on('error', (错误) => console.log('声音后台进程启动失败：' + 错误.message))
    }
    保护到 = 现在() + 保护毫秒
    return {
      成功: true,
      已就绪: false,
      正在加载: true,
      说明: '声音服务已在后台启动，加载期间不会显示终端窗口',
    }
  }

  return Object.freeze({ 启动 })
}

module.exports = { 创建声音启动器 }
