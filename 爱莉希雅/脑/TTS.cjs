/**
 * TTS.cjs —— 主程序与具体声音服务之间的稳定接口。
 *
 * 主流程只认 status() / speak()；GPT-SoVITS 的端口、请求格式和返回细节继续留在语音.cjs。
 * 以后换本地模型或远程服务，只需要增加驱动，不必改聊天、窗口和故障处理。
 */
'use strict'

const 本机语音 = require('./语音.cjs')

function 文本(值, 最长 = 240) {
  return String(值 == null ? '' : 值).trim().slice(0, 最长)
}

function 创建TTS(驱动) {
  if (!驱动 || typeof 驱动 !== 'object') throw new Error('TTS 驱动不能为空')
  if (typeof 驱动.status !== 'function') throw new Error('TTS 驱动缺少 status()')
  if (typeof 驱动.speak !== 'function') throw new Error('TTS 驱动缺少 speak()')
  const 提供者 = 文本(驱动.id || 驱动.名字 || 'unknown', 60) || 'unknown'
  const prepareText = typeof 驱动.prepareText === 'function' ? 驱动.prepareText : (内容) => String(内容 || '').trim()

  async function status(超时毫秒) {
    try {
      const 果 = await 驱动.status(超时毫秒)
      return {
        在: !!(果 && 果.在),
        忙: Number((果 && 果.忙) || 0),
        说明: 文本(果 && 果.说明) || (果 && 果.在 ? '在线' : '不可用'),
        提供者,
      }
    } catch (错误) {
      return { 在: false, 忙: 0, 说明: '声音状态检查失败：' + 文本(错误.message), 提供者 }
    }
  }

  async function speak(原文) {
    const 要说的 = String(prepareText(原文) || '').trim()
    if (!要说的) return { 成功: false, 说明: '没有适合朗读的内容', 提供者 }
    try {
      const 果 = await 驱动.speak(要说的)
      if (!果 || !果.成功) {
        return { 成功: false, 说明: 文本(果 && 果.说明) || '声音没有合成成功', 提供者 }
      }
      if (!Buffer.isBuffer(果.音频) || !果.音频.length) {
        return { 成功: false, 说明: '声音服务没有返回音频', 提供者 }
      }
      return {
        成功: true,
        音频: 果.音频,
        类型: 文本(果.类型, 80) || 'audio/mpeg',
        用时: Number(果.用时) || 0,
        说明: 文本(果.说明) || '合成好了',
        提供者,
      }
    } catch (错误) {
      return { 成功: false, 说明: '声音合成失败：' + 文本(错误.message), 提供者 }
    }
  }

  async function stream(原文, 选项 = {}) {
    const 要说的 = String(prepareText(原文) || '').trim()
    if (!要说的) return { 成功: false, 说明: '没有适合朗读的内容', 提供者 }
    if (typeof 驱动.stream !== 'function') return { 成功: false, 不支持: true, 说明: '当前声音驱动不支持流式音频', 提供者 }
    try {
      const 果 = await 驱动.stream(要说的, 选项)
      if (!果 || !果.成功) return { ...(果 || {}), 成功: false, 说明: 文本(果 && 果.说明) || '声音流没有成功', 提供者 }
      return {
        成功: true,
        类型: 文本(果.类型, 80) || 'audio/pcm',
        格式: 文本(果.格式, 40) || 'pcm_s16le',
        采样率: Number(果.采样率) || 32000,
        字节数: Number(果.字节数) || 0,
        用时: Number(果.用时) || 0,
        说明: 文本(果.说明) || '流式合成完成',
        提供者,
      }
    } catch (错误) {
      return { 成功: false, 说明: '声音流失败：' + 文本(错误.message), 提供者 }
    }
  }

  return Object.freeze({ status, speak, stream, prepareText, 提供者 })
}

const 默认TTS = 创建TTS({
  id: 'gpt-sovits-local',
  status: (超时毫秒) => 本机语音.在吗(超时毫秒),
  speak: (文字) => 本机语音.合成(文字),
  stream: (文字, 选项) => 本机语音.流式合成(文字, 选项),
  prepareText: (文字) => 本机语音.适合念(文字),
})

module.exports = { 创建TTS, 默认TTS }
