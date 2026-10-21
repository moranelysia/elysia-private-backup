/**
 * ASR.cjs —— 主程序与具体语音识别服务之间的稳定接口。
 *
 * 这一层只接收已经录好的音频，不申请麦克风权限，也不决定录音界面。
 * 以后接 FunASR、Whisper 或远程服务时，只需要实现 status() / transcribe()。
 */
'use strict'

const 最大音频字节 = 20 * 1024 * 1024

function 短文字(值, 最长 = 240) {
  return String(值 == null ? '' : 值).replace(/\s+/g, ' ').trim().slice(0, 最长)
}

function 音频缓冲(值) {
  if (Buffer.isBuffer(值)) return 值
  if (值 instanceof ArrayBuffer) return Buffer.from(值)
  if (ArrayBuffer.isView(值)) return Buffer.from(值.buffer, 值.byteOffset, 值.byteLength)
  return null
}

function 创建ASR(驱动) {
  if (!驱动 || typeof 驱动 !== 'object') throw new Error('ASR 驱动不能为空')
  if (typeof 驱动.status !== 'function') throw new Error('ASR 驱动缺少 status()')
  if (typeof 驱动.transcribe !== 'function') throw new Error('ASR 驱动缺少 transcribe()')
  const 提供者 = 短文字(驱动.id || 驱动.名字 || 'unknown', 60) || 'unknown'

  async function status(超时毫秒) {
    try {
      const 果 = await 驱动.status(超时毫秒)
      return {
        在: !!(果 && 果.在),
        已配置: 果 && Object.hasOwn(果, '已配置') ? !!果.已配置 : !!(果 && 果.在),
        说明: 短文字(果 && 果.说明) || (果 && 果.在 ? '在线' : '不可用'),
        提供者,
      }
    } catch (错误) {
      return { 在: false, 已配置: true, 说明: '语音识别状态检查失败：' + 短文字(错误.message), 提供者 }
    }
  }

  async function transcribe(原始音频, 选项 = {}) {
    const 音频 = 音频缓冲(原始音频)
    if (!音频 || !音频.length) return { 成功: false, 说明: '没有可识别的录音', 提供者 }
    if (音频.length > 最大音频字节) {
      return { 成功: false, 说明: `录音太大（上限 ${最大音频字节 / 1024 / 1024} MB）`, 提供者 }
    }

    const 参数 = {
      类型: 短文字(选项.类型, 80) || 'audio/webm',
      语言: 短文字(选项.语言, 20) || 'zh',
      中止: 选项.中止,
    }
    try {
      const 果 = await 驱动.transcribe(音频, 参数)
      if (!果 || !果.成功) {
        return {
          成功: false,
          已取消: !!(果 && 果.已取消),
          说明: 短文字(果 && 果.说明) || '录音没有识别成功',
          提供者,
        }
      }
      const 文字 = 短文字(果.文字, 10000)
      if (!文字) return { 成功: false, 说明: '语音识别没有返回文字', 提供者 }
      return {
        成功: true,
        文字,
        语言: 短文字(果.语言, 20) || 参数.语言,
        用时: Number(果.用时) || 0,
        内存MB: Number(果.内存MB) || 0,
        说明: 短文字(果.说明) || '识别好了',
        提供者,
      }
    } catch (错误) {
      if (错误 && 错误.name === 'AbortError') {
        return { 成功: false, 已取消: true, 说明: '语音识别已取消', 提供者 }
      }
      return { 成功: false, 说明: '语音识别失败：' + 短文字(错误 && 错误.message), 提供者 }
    }
  }

  function stop() {
    if (typeof 驱动.stop === 'function') 驱动.stop()
  }

  return Object.freeze({ status, transcribe, stop, 提供者 })
}

const 本机ASR = require('./本机ASR.cjs')
const 默认ASR = 创建ASR(本机ASR)

module.exports = { 创建ASR, 默认ASR, 最大音频字节 }
