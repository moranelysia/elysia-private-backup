/** SenseVoiceSmall INT8 工作进程。stdin/stdout 只传单行 JSON。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

function 发(值) { process.stdout.write(JSON.stringify(值) + '\n') }
function 内存MB() { return Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10 }

function 读PCM16WAV(文件) {
  const 数据 = fs.readFileSync(文件)
  if (数据.toString('ascii', 0, 4) !== 'RIFF' || 数据.toString('ascii', 8, 12) !== 'WAVE') throw new Error('录音不是 WAV')
  let 位置 = 12
  let 采样率 = 0
  let 声道 = 0
  let 位数 = 0
  let PCM = null
  while (位置 + 8 <= 数据.length) {
    const 名 = 数据.toString('ascii', 位置, 位置 + 4)
    const 长度 = 数据.readUInt32LE(位置 + 4)
    const 开始 = 位置 + 8
    if (名 === 'fmt ') {
      if (数据.readUInt16LE(开始) !== 1) throw new Error('只支持 PCM WAV')
      声道 = 数据.readUInt16LE(开始 + 2)
      采样率 = 数据.readUInt32LE(开始 + 4)
      位数 = 数据.readUInt16LE(开始 + 14)
    } else if (名 === 'data') {
      PCM = 数据.subarray(开始, Math.min(开始 + 长度, 数据.length))
    }
    位置 = 开始 + 长度 + (长度 % 2)
  }
  if (!PCM || !采样率 || 位数 !== 16 || 声道 < 1) throw new Error('只支持 16bit PCM WAV')
  const 帧数 = Math.floor(PCM.length / 2 / 声道)
  const samples = new Float32Array(帧数)
  for (let i = 0; i < 帧数; i++) {
    let 和 = 0
    for (let c = 0; c < 声道; c++) 和 += PCM.readInt16LE((i * 声道 + c) * 2) / 32768
    samples[i] = 和 / 声道
  }
  return { sampleRate: 采样率, samples }
}

async function main() {
  const 根 = path.resolve(process.argv[2] || '')
  const 模型目录 = path.join(根, 'model')
  const sherpa = require(path.join(根, 'runtime', 'node_modules', 'sherpa-onnx-node'))
  const 配置 = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: {
        model: path.join(模型目录, 'model.int8.onnx'),
        language: 'zh',
        useInverseTextNormalization: 1,
      },
      tokens: path.join(模型目录, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  }
  const 开始 = performance.now()
  const 识别器 = await sherpa.OfflineRecognizer.createAsync(配置)
  发({ type: 'ready', loadSeconds: (performance.now() - 开始) / 1000, memoryMB: 内存MB(), version: sherpa.version })

  const 输入 = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const 行 of 输入) {
    let 请求 = null
    try {
      请求 = JSON.parse(行)
      const 音频 = 读PCM16WAV(path.resolve(String(请求.path || '')))
      const 流 = 识别器.createStream()
      流.acceptWaveform(音频)
      const 转写开始 = performance.now()
      const 结果 = await 识别器.decodeAsync(流)
      const 文字 = String(结果.text || '').replace(/<\|[^|]+\|>/g, '').trim()
      发({
        type: 'result', id: String(请求.id || ''), ok: !!文字, text: 文字,
        seconds: (performance.now() - 转写开始) / 1000, memoryMB: 内存MB(),
      })
    } catch (错误) {
      发({ type: 'result', id: String(请求 && 请求.id || ''), ok: false, error: String(错误.message || 错误).slice(0, 300) })
    }
  }
}

main().catch((错误) => {
  发({ type: 'fatal', error: String(错误.stack || 错误).slice(0, 1000) })
  process.exitCode = 1
})
