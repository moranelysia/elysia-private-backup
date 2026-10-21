/**
 * 语音.cjs —— 让她把话说出声
 *
 * 【声音是怎么来的】
 *   这台电脑上已经跑着两个程序（你自己双击 tools\voice\start-voice.cmd 起来的）：
 *
 *     9880 端口 —— GPT-SoVITS 本体，真正"发声"的那个
 *     9881 端口 —— 转接层，一个翻译官：把"给我合成这句话"翻译成 GPT-SoVITS 听得懂的请求
 *
 *   我们这个程序只跟 9881 打交道。为什么？因为 9881 是你之前调好的，
 *   里面有我训练出来的音色、语速、参考音频那一整套配置（tools\voice\voice.json）。
 *   绕过它自己去调 9880，就得把那些配置再抄一遍 —— 抄两份，早晚会不一致。
 *
 * 【合成一句要多久】
 *   第一次（刚启动那两个服务时）要编译 CUDA 内核，实测 44 秒；
 *   之后每句大约 3 秒。所以那两个服务自己会先"热一下"。
 *
 * 【为什么返回的是"一段字节"而不是文件路径】
 *   因为我们不需要把它存成文件。合成完的音频直接塞给窗口里的播放器播出来就行，
 *   省一次写盘、也省得你硬盘里堆一堆 mp3。
 *   （想存下来听的话，用 scripts\say.cjs，那个是存文件的。）
 */
'use strict'

const 配置 = require('./配置.cjs')
const 转接层 = 配置.语音转接层

/**
 * 看看声音服务在不在。
 * 每次说话前都会先问一句 —— 因为那两个服务是需要你手动起的，
 * 没起的话我们要能马上告诉你"声音服务没开"，而不是干等半分钟然后报个看不懂的错。
 */
async function 在吗(超时毫秒 = 1200) {
  const 控制器 = new AbortController()
  const 闹钟 = setTimeout(() => 控制器.abort(), 超时毫秒)
  try {
    const 回应 = await fetch(转接层 + '/', { signal: 控制器.signal })
    if (!回应.ok) return { 在: false, 说明: `转接层回了 HTTP ${回应.status}` }
    const 信息 = await 回应.json()
    if (信息.ok === false || 信息.sovitsReady === false) {
      return { 在: false, 说明: '转接层还在，但 GPT-SoVITS 本体没有就绪' }
    }
    return {
      在: true,
      说明: `在线（版本 ${信息.version || '?'}，参考音频 ${信息.ref || '?'}）`,
      忙: 信息.busy ?? 0,
    }
  } catch (错误) {
    return {
      在: false,
      说明: 错误.name === 'AbortError' ? '连不上（超时）' : '连不上（' + 错误.message + '）',
    }
  } finally {
    clearTimeout(闹钟)
  }
}

/**
 * 把一句话合成成声音。
 *
 * @param {string} 文字
 * @returns {Promise<{成功:boolean, 音频?:Buffer, 类型?:string, 用时?:number, 说明:string}>}
 */
async function 合成(文字) {
  const 要说的 = String(文字 || '').trim()
  if (!要说的) return { 成功: false, 说明: '没有内容要合成' }

  // 转接层那边对长度有上限（voice.json 里写着 maxChars: 400），
  // 超了会被退回 400，所以在这儿先量一下，并且给她留点余地。
  const 字数 = [...要说的].length
  if (字数 > 400) {
    return { 成功: false, 说明: `太长啦（${字数} 字，上限 400）—— 分两次说吧` }
  }

  const 开始 = Date.now()
  let 回应
  try {
    回应 = await fetch(转接层 + '/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer local' },
      body: JSON.stringify({ model: 'gpt-sovits', input: 要说的, voice: 'alloy' }),
    })
  } catch (错误) {
    return { 成功: false, 说明: '合成请求发不出去：' + 错误.message }
  }

  const 类型 = 回应.headers.get('content-type') || ''
  const 数据 = Buffer.from(await 回应.arrayBuffer())
  const 用时 = (Date.now() - 开始) / 1000

  if (!回应.ok) {
    return { 成功: false, 说明: `合成失败 HTTP ${回应.status}：${数据.toString('utf8').slice(0, 200)}` }
  }
  if (类型.includes('json')) {
    // 转接层出错时会回一段 json，这里把它的原话带出去，好排查
    return { 成功: false, 说明: '转接层返回的不是音频：' + 数据.toString('utf8').slice(0, 200) }
  }

  return {
    成功: true,
    音频: 数据,
    类型: 类型.split(';')[0].trim() || 'audio/mpeg',
    用时,
    说明: `合成好了（${(数据.length / 1024).toFixed(1)} KB，用时 ${用时.toFixed(1)}s）`,
  }
}

/** 边接收边交付单声道 s16le PCM；取消信号会一路传到转接层和 GPT-SoVITS。 */
async function 流式合成(文字, { 中止, 收到音频 } = {}) {
  const 要说的 = String(文字 || '').trim()
  if (!要说的) return { 成功: false, 说明: '没有内容要合成' }
  const 字数 = [...要说的].length
  if (字数 > 400) return { 成功: false, 说明: `太长啦（${字数} 字，上限 400）—— 分两次说吧` }

  const 开始 = Date.now()
  let 回应
  try {
    回应 = await fetch(转接层 + '/v1/audio/speech/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer local' },
      body: JSON.stringify({ model: 'gpt-sovits', input: 要说的, voice: 'alloy' }),
      signal: 中止,
    })
  } catch (错误) {
    if (错误.name === 'AbortError') return { 成功: false, 已取消: true, 说明: '流式合成已取消' }
    return { 成功: false, 说明: '流式合成请求发不出去：' + 错误.message }
  }

  if (!回应.ok) {
    const 数据 = await 回应.text().catch(() => '')
    return { 成功: false, 说明: `流式合成失败 HTTP ${回应.status}：${数据.slice(0, 200)}` }
  }
  if (!回应.body) return { 成功: false, 说明: '声音服务没有返回音频流' }

  const 采样率 = Number(回应.headers.get('x-sample-rate')) || 32000
  const 格式 = 回应.headers.get('x-audio-format') || 'pcm_s16le'
  let 字节数 = 0
  try {
    const reader = 回应.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || !value.byteLength) continue
      const 块 = Buffer.from(value)
      字节数 += 块.length
      if (typeof 收到音频 === 'function') await 收到音频(块, { 采样率, 格式 })
    }
  } catch (错误) {
    if (错误.name === 'AbortError') return { 成功: false, 已取消: true, 说明: '流式合成已取消' }
    return { 成功: false, 说明: '声音流中断：' + 错误.message }
  }

  if (字节数 < 2) return { 成功: false, 说明: '声音服务返回了空音频流' }
  const 用时 = (Date.now() - 开始) / 1000
  return { 成功: true, 类型: 'audio/pcm', 格式, 采样率, 字节数, 用时, 说明: `流式合成完成（${(字节数 / 1024).toFixed(1)} KB）` }
}

/** 把她的回话清一清，再拿去合成 —— 有些东西念出来很奇怪 */
function 适合念(文字) {
  return String(文字 || '')
    .replace(/[\[【][^\]】]*[\]】]/g, '') // 万一还有标记没抠干净
    .replace(/[*_`>#]/g, '') // markdown 的符号，念出来是噪音
    .replace(/♪\uFE0F?/g, '，') // 音符是她的语气停顿；转接层原本会把它当 emoji 直接删掉
    .replace(/[—―]+/g, '。') // GPT-SoVITS 的 cut5 不把破折号当停顿，朗读时改成明确停顿
    .replace(/\n{2,}/g, '。') // 段落之间给个停顿
    .replace(/\n/g, '，')
    .replace(/\s{2,}/g, ' ')
    .replace(/。{2,}/g, '。')
    .replace(/，{2,}/g, '，')
    .trim()
}

module.exports = { 合成, 流式合成, 在吗, 适合念, 转接层 }

if (require.main === module) {
  const 文字 = process.argv.slice(2).join(' ') || '你好呀，我是爱莉希雅。'
  ;(async () => {
    const 状态 = await 在吗()
    console.log('声音服务: ' + 状态.说明)
    if (!状态.在) {
      console.log('（请先启动配置的 GPT-SoVITS 转接服务：' + 转接层 + '）')
      process.exit(1)
    }
    const 要念的 = 适合念(文字)
    console.log('要念: ' + 要念的)
    const 结果 = await 合成(要念的)
    console.log((结果.成功 ? '✓ ' : '✗ ') + 结果.说明)
    if (结果.成功) {
      const fs = require('node:fs')
      const path = require('node:path')
      const 输出 = path.join(配置.缓存目录, '语音试听-' + Date.now() + '.mp3')
      fs.mkdirSync(path.dirname(输出), { recursive: true })
      fs.writeFileSync(输出, 结果.音频)
      console.log('存到: ' + 输出)
    }
  })()
}
