/** 当前 Paraformer Large 隔离基准：与 SenseVoice 使用同一批 WAV。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { 创建ASR } = require('../脑/ASR.cjs')
const 本机ASR = require('../脑/ParaformerASR.cjs')
const 默认ASR = 创建ASR(本机ASR)

const 项目根 = path.resolve(__dirname, '..')
const 输出 = path.join(项目根, '.cache', 'asr-candidates', 'sensevoice-int8', 'benchmark-current-funasr.json')
const 样本根 = 'D:\\GPT-SoVITS\\asr-in'
const 参照文件 = 'D:\\GPT-SoVITS\\asr-out\\asr-in.list'

async function main() {
  const 名字们 = fs.readFileSync(参照文件, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    .map((行) => path.basename(String(行.split('|')[0] || '')))
    .filter((名字) => 名字 && fs.existsSync(path.join(样本根, 名字)))
  const 结果们 = []
  const 总开始 = performance.now()
  for (const 名字 of 名字们) {
    const 开始 = performance.now()
    const 结果 = await 默认ASR.transcribe(fs.readFileSync(path.join(样本根, 名字)), { 类型: 'audio/wav', 语言: 'zh' })
    const 总秒 = (performance.now() - 开始) / 1000
    if (!结果.成功) throw new Error(`${名字}: ${结果.说明}`)
    结果们.push({ 文件: 名字, 总秒: Math.round(总秒 * 1000) / 1000, 模型识别秒: 结果.用时, 内存MB: 结果.内存MB, 文字: 结果.文字 })
  }
  const 报告 = {
    时间: new Date().toISOString(),
    样本数: 结果们.length,
    首次总秒: 结果们[0]?.总秒 || 0,
    暖机平均秒: 结果们.length > 1 ? Math.round(结果们.slice(1).reduce((和, x) => 和 + x.总秒, 0) / (结果们.length - 1) * 1000) / 1000 : 0,
    进程内存MB: 结果们.at(-1)?.内存MB || 0,
    全部总秒: Math.round((performance.now() - 总开始) / 1000 * 1000) / 1000,
    结果们,
  }
  fs.writeFileSync(输出, JSON.stringify(报告, null, 2), 'utf8')
  console.log(JSON.stringify(报告, null, 2))
  本机ASR.stop()
}

main().catch((错误) => {
  本机ASR.stop()
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
