/** 真实验证 SenseVoice 的取消、故障隔离、重试、进程退出和临时文件清理。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const 驱动 = require(path.join(根, '脑', 'SenseVoiceASR.cjs'))
const { 缓存目录 } = require(path.join(根, '脑', '配置.cjs'))
const 样本 = 'D:\\GPT-SoVITS\\asr-in\\c040.wav'
let 通过 = 0

function 检查(名称, 条件) {
  if (!条件) throw new Error('失败：' + 名称)
  通过++
  console.log('✓ ' + 名称)
}

function 缓存WAV() {
  const 目录 = path.join(缓存目录, 'asr')
  return fs.existsSync(目录) ? fs.readdirSync(目录).filter(x => x.endsWith('.wav')) : []
}

function 等待(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function main() {
  if (!fs.existsSync(样本)) throw new Error('缺少固定测试录音：' + 样本)
  const 已取消 = new AbortController()
  已取消.abort()
  const 提前 = await 驱动.transcribe(fs.readFileSync(样本), { 中止: 已取消.signal })
  检查('提前取消不启动模型', 提前.已取消 && !驱动.diagnostics().running)

  const 加载中 = new AbortController()
  const 请求 = 驱动.transcribe(fs.readFileSync(样本), { 中止: 加载中.signal })
  setTimeout(() => 加载中.abort(), 50)
  const 取消结果 = await 请求
  await 等待(200)
  检查('加载期间取消会释放模型', 取消结果.已取消 && !驱动.diagnostics().running)
  检查('取消后没有遗留录音', 缓存WAV().length === 0)

  const 坏结果 = await 驱动.transcribe(Buffer.from('not wav'))
  检查('坏录音被隔离成失败结果', !坏结果.成功 && /WAV/.test(坏结果.说明 || ''))
  检查('坏录音后临时文件已删除', 缓存WAV().length === 0)

  const 重试 = await 驱动.transcribe(fs.readFileSync(样本))
  检查('一次失败后仍能继续识别', 重试.成功 && /优雅|美丽|可爱/.test(重试.文字))
  驱动.stop()
  await 等待(300)
  检查('主动停止会退出工作进程', !驱动.diagnostics().running)
  检查('停止后没有遗留录音', 缓存WAV().length === 0)
  console.log(`\nSenseVoice 驱动：${通过}/8 通过`)
}

main().catch((错误) => {
  驱动.stop()
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
