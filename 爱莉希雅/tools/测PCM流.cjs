/** PCM 流协议：假 GPT-SoVITS 响应，不启动真实声音服务。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const 外层声音 = path.resolve(根, '..', 'tools', 'voice')
const { sovitsBody, synthesizePcmStream } = require(path.join(外层声音, 'tts-bridge.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  const cfg = {
    sovitsApi: 'http://127.0.0.1:1',
    ref: 'default', refs: { default: { file: 'ref.wav', text: '参考' } },
    streamingMode: 2, streamOverlapLength: 2, streamMinChunkLength: 16, streamSampleRate: 32000,
  }
  const 请求体 = sovitsBody('你好。', cfg, true)
  检查('流式请求使用 raw PCM', 请求体.media_type === 'raw')
  检查('流式模式读取配置的模式 2', 请求体.streaming_mode === 2)
  检查('流式块参数传给 GPT-SoVITS', 请求体.overlap_length === 2 && 请求体.min_chunk_length === 16)
  检查('非流式旧接口仍返回 WAV', sovitsBody('你好。', cfg, false).media_type === 'wav' && sovitsBody('你好。', cfg, false).streaming_mode === false)

  let 发出的体 = null
  let 已就绪 = 0
  const 收到 = []
  const fakeFetch = async (_url, 选项) => {
    发出的体 = JSON.parse(选项.body)
    return new Response(new ReadableStream({
      start(控制器) {
        控制器.enqueue(new Uint8Array([1, 2, 3]))
        控制器.enqueue(new Uint8Array([4, 5]))
        控制器.close()
      },
    }), { status: 200, headers: { 'content-type': 'audio/raw' } })
  }
  const 结果 = await synthesizePcmStream('你好。', cfg, {
    fetchImpl: fakeFetch,
    onReady: ({ sampleRate }) => { 已就绪 = sampleRate },
    onChunk: (块) => 收到.push(...块),
  })
  检查('转接层逐块交付而非合并后返回', 收到.join(',') === '1,2,3,4,5')
  检查('PCM 字节数和采样率准确返回', 结果.bytes === 5 && 结果.sampleRate === 32000 && 已就绪 === 32000)
  检查('发给上游的确是流式请求', 发出的体.streaming_mode === 2 && 发出的体.media_type === 'raw')

  const 主进程 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
  const 预加载 = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
  const 界面 = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
  const 语音驱动 = fs.readFileSync(path.join(根, '脑', '语音.cjs'), 'utf8')
  const 转接层源码 = fs.readFileSync(path.join(外层声音, 'tts-bridge.cjs'), 'utf8')
  检查('主进程限制声音流编号格式', 主进程.includes("/^[a-zA-Z0-9_-]{1,80}$/"))
  检查('主进程支持取消并向驱动传 AbortSignal', 主进程.includes("ipcMain.on('取消流式语音'") && 主进程.includes('中止: 控制器.signal'))
  检查('preload 只暴露固定流式 IPC', 预加载.includes('流式合成语音:') && 预加载.includes('取消流式语音:') && 预加载.includes('语音流片段:'))
  检查('界面使用 Web Audio 连续调度 PCM', 界面.includes('createBufferSource()') && 界面.includes('PCM下次时刻'))
  检查('流式失败前未出声时保留旧整句回退', 界面.includes('if (!已经出声) return window.爱莉.合成语音(文字)'))

  const 配置 = JSON.parse(fs.readFileSync(path.join(外层声音, 'voice.json'), 'utf8'))
  检查('声音配置启用中档流式模式和 32k 采样率', 配置.streamingMode === 2 && 配置.streamSampleRate === 32000)
  检查('健康检查同时核对 GPT-SoVITS 本体', 转接层源码.includes('sovitsReady') && 语音驱动.includes('信息.sovitsReady === false'))

  console.log(`\nPCM 流：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
