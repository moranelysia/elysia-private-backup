/** SenseVoiceSmall INT8 隔离基准：不修改正式 ASR，不申请麦克风。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 候选根 = path.join(项目根, '.cache', 'asr-candidates', 'sensevoice-int8')
const 正式根 = path.join(项目根, 'local-models', 'asr', 'sensevoice')
const 模型根 = path.join(正式根, 'model')
const sherpa = require(path.join(正式根, 'runtime', 'node_modules', 'sherpa-onnx-node'))
const 样本根 = 'D:\\GPT-SoVITS\\asr-in'
const 参照文件 = 'D:\\GPT-SoVITS\\asr-out\\asr-in.list'

function 内存MB() {
  global.gc?.()
  return Math.round(process.memoryUsage().rss / 1024 / 1024 * 10) / 10
}

function 规整(文字) {
  return String(文字 || '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/[\s，。！？、；：,.!?;:'“”‘’（）()《》【】\[\]—-]/g, '')
    .toLowerCase()
}

function 编辑距离(a, b) {
  const 前 = Array.from(a)
  const 后 = Array.from(b)
  let 上 = Array.from({ length: 后.length + 1 }, (_, i) => i)
  for (let i = 1; i <= 前.length; i++) {
    const 今 = [i]
    for (let j = 1; j <= 后.length; j++) {
      今[j] = Math.min(今[j - 1] + 1, 上[j] + 1, 上[j - 1] + (前[i - 1] === 后[j - 1] ? 0 : 1))
    }
    上 = 今
  }
  return 上[后.length]
}

function 读参照() {
  const map = new Map()
  for (const 行 of fs.readFileSync(参照文件, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const 段 = 行.split('|')
    if (段.length >= 4) map.set(path.basename(段[0]), 段.slice(3).join('|').trim())
  }
  return map
}

function 读PCM16WAV(文件) {
  const 数据 = fs.readFileSync(文件)
  if (数据.toString('ascii', 0, 4) !== 'RIFF' || 数据.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是 WAV：' + 文件)
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
  if (!PCM || !采样率 || 位数 !== 16 || 声道 < 1) throw new Error('不支持的 WAV 格式：' + 文件)
  const 帧数 = Math.floor(PCM.length / 2 / 声道)
  const samples = new Float32Array(帧数)
  for (let i = 0; i < 帧数; i++) samples[i] = PCM.readInt16LE(i * 声道 * 2) / 32768
  return { sampleRate: 采样率, samples }
}

async function main() {
  const 必需 = [path.join(模型根, 'model.int8.onnx'), path.join(模型根, 'tokens.txt'), 参照文件]
  for (const 文件 of 必需) if (!fs.existsSync(文件)) throw new Error('缺少基准文件：' + 文件)
  const 参照 = 读参照()
  const 样本们 = [...参照.keys()].filter((名字) => fs.existsSync(path.join(样本根, 名字))).sort()
  if (!样本们.length) throw new Error('没有找到共同测试样本')

  const 基线内存 = 内存MB()
  const 配置 = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: { model: path.join(模型根, 'model.int8.onnx'), language: 'zh', useInverseTextNormalization: 1 },
      tokens: path.join(模型根, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    },
  }
  const 加载开始 = performance.now()
  const 识别器 = await sherpa.OfflineRecognizer.createAsync(配置)
  const 加载秒 = (performance.now() - 加载开始) / 1000
  const 加载后内存MB = 内存MB()
  const 结果们 = []
  let 总距离 = 0
  let 总参照字 = 0

  for (const 名字 of 样本们) {
    const 文件 = path.join(样本根, 名字)
    const wave = 读PCM16WAV(文件)
    const stream = 识别器.createStream()
    stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples })
    const 开始 = performance.now()
    const 结果 = await 识别器.decodeAsync(stream)
    const 秒 = (performance.now() - 开始) / 1000
    const 文字 = String(结果.text || '').replace(/<\|[^|]+\|>/g, '').trim()
    const 参考文字 = 参照.get(名字)
    const 参考净 = 规整(参考文字)
    const 识别净 = 规整(文字)
    const 距离 = 编辑距离(参考净, 识别净)
    总距离 += 距离
    总参照字 += Array.from(参考净).length
    结果们.push({
      文件: 名字,
      音频秒: Math.round(wave.samples.length / wave.sampleRate * 100) / 100,
      识别秒: Math.round(秒 * 1000) / 1000,
      RTF: Math.round(秒 / (wave.samples.length / wave.sampleRate) * 1000) / 1000,
      字符差异: 距离,
      参照: 参考文字,
      SenseVoice: 文字,
    })
  }

  const 报告 = {
    时间: new Date().toISOString(),
    sherpa版本: sherpa.version,
    onnxruntime版本: sherpa.onnxruntimeVersion,
    模型字节: fs.statSync(path.join(模型根, 'model.int8.onnx')).size,
    基线内存MB: 基线内存,
    加载秒: Math.round(加载秒 * 1000) / 1000,
    加载后内存MB,
    新增内存MB: Math.round((加载后内存MB - 基线内存) * 10) / 10,
    测后内存MB: 内存MB(),
    样本数: 结果们.length,
    相对参照字符错误率: 总参照字 ? Math.round(总距离 / 总参照字 * 10000) / 10000 : null,
    结果们,
  }
  fs.writeFileSync(path.join(候选根, 'benchmark.json'), JSON.stringify(报告, null, 2), 'utf8')
  console.log(JSON.stringify(报告, null, 2))
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
