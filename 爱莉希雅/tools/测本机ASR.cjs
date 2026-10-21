/** 用一段已有 WAV 验证默认 SenseVoice；会真实加载模型，但不会启动麦克风。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const { 默认ASR } = require(path.join(根, '脑', 'ASR.cjs'))
const 本机驱动 = require(path.join(根, '脑', '本机ASR.cjs'))

async function main() {
  const 样本 = process.argv[2] || 'D:\\GPT-SoVITS\\asr-in\\c040.wav'
  if (!fs.existsSync(样本)) throw new Error('找不到测试录音：' + 样本)
  const 状态 = await 默认ASR.status()
  console.log('状态：' + 状态.说明)
  if (!状态.在) throw new Error(状态.说明)
  const 开始 = Date.now()
  const 结果 = await 默认ASR.transcribe(fs.readFileSync(样本), { 类型: 'audio/wav', 语言: 'zh' })
  console.log('首次总用时：' + ((Date.now() - 开始) / 1000).toFixed(2) + ' 秒')
  console.log('进程内存：' + (结果.内存MB || 0) + ' MB')
  console.log('转写：' + (结果.文字 || 结果.说明))
  if (!结果.成功) throw new Error(结果.说明)
  if (!/优雅|美丽|可爱/.test(结果.文字)) throw new Error('转写没有命中样本中的关键字')
  const 暖机开始 = Date.now()
  const 暖机结果 = await 默认ASR.transcribe(fs.readFileSync(样本), { 类型: 'audio/wav', 语言: 'zh' })
  console.log('暖机转写：' + ((Date.now() - 暖机开始) / 1000).toFixed(2) + ' 秒')
  if (!暖机结果.成功 || !/优雅|美丽|可爱/.test(暖机结果.文字)) throw new Error('暖机转写失败')
  本机驱动.stop()
  console.log('✓ 本机 SenseVoice 固定音频转写通过')
}

main().catch((错误) => {
  本机驱动.stop()
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
