/** ASR 适配层：只用假驱动，不申请麦克风，也不连接识别服务。 */
'use strict'

const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const { 创建ASR, 默认ASR, 最大音频字节 } = require(path.join(根, '脑', 'ASR.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  let 错 = ''
  try { 创建ASR() } catch (错误) { 错 = 错误.message }
  检查('拒绝空驱动', /不能为空/.test(错))
  try { 创建ASR({ transcribe() {} }) } catch (错误) { 错 = 错误.message }
  检查('驱动必须实现 status', /status/.test(错))
  try { 创建ASR({ status() {} }) } catch (错误) { 错 = 错误.message }
  检查('驱动必须实现 transcribe', /transcribe/.test(错))

  let 收到超时 = 0
  let 收到音频 = null
  let 收到参数 = null
  let 转写次数 = 0
  const ASR = 创建ASR({
    id: 'fake-asr',
    status: async (超时) => { 收到超时 = 超时; return { 在: true, 说明: '假服务在线' } },
    transcribe: async (音频, 参数) => {
      转写次数++
      收到音频 = 音频
      收到参数 = 参数
      return { 成功: true, 文字: '  你好\n爱莉希雅  ', 语言: 'zh-CN', 用时: 0.8 }
    },
  })

  const 状态 = await ASR.status(456)
  检查('状态超时参数传给驱动', 收到超时 === 456)
  检查('状态结果统一并标注提供者', 状态.在 && 状态.已配置 && 状态.提供者 === 'fake-asr')
  const 控制器 = new AbortController()
  const 成功 = await ASR.transcribe(new Uint8Array([1, 2, 3]), { 类型: 'audio/wav', 语言: 'zh', 中止: 控制器.signal })
  检查('TypedArray 音频转为 Buffer', Buffer.isBuffer(收到音频) && 收到音频.join(',') === '1,2,3')
  检查('音频类型、语言和取消信号传给驱动', 收到参数.类型 === 'audio/wav' && 收到参数.语言 === 'zh' && 收到参数.中止 === 控制器.signal)
  检查('成功转写清理空白并统一结构', 成功.成功 && 成功.文字 === '你好 爱莉希雅' && 成功.语言 === 'zh-CN' && 成功.提供者 === 'fake-asr')
  const 粗转写 = 创建ASR({ status: async () => ({ 在: true }), transcribe: async () => ({ 成功: true, 文字: '美比乌斯和牙医' }) })
  检查('ASR 保留粗转写原文不做专名替换', (await 粗转写.transcribe(Buffer.from([1]))).文字 === '美比乌斯和牙医')

  const 次数前 = 转写次数
  检查('空 Buffer 不调用驱动', !(await ASR.transcribe(Buffer.alloc(0))).成功 && 转写次数 === 次数前)
  检查('错误输入不调用驱动', !(await ASR.transcribe('不是音频')).成功 && 转写次数 === 次数前)
  检查('过大录音在适配层拒绝', !(await ASR.transcribe(Buffer.alloc(最大音频字节 + 1))).成功 && 转写次数 === 次数前)

  const 空文字 = 创建ASR({ status: async () => ({ 在: true }), transcribe: async () => ({ 成功: true, 文字: '  ' }) })
  检查('成功但没有文字按失败处理', /没有返回文字/.test((await 空文字.transcribe(Buffer.from([1]))).说明))
  const 服务拒绝 = 创建ASR({ status: async () => ({ 在: false }), transcribe: async () => ({ 成功: false, 说明: '模型忙' }) })
  检查('驱动失败转成统一失败', (await 服务拒绝.transcribe(Buffer.from([1]))).说明 === '模型忙')
  const 会抛错 = 创建ASR({ status: async () => { throw new Error('状态炸了') }, transcribe: async () => { throw new Error('识别炸了') } })
  检查('状态异常被隔离', !(await 会抛错.status()).在 && /状态炸了/.test((await 会抛错.status()).说明))
  检查('识别异常被隔离', !(await 会抛错.transcribe(Buffer.from([1]))).成功 && /识别炸了/.test((await 会抛错.transcribe(Buffer.from([1]))).说明))
  const 会取消 = 创建ASR({ status: async () => ({ 在: true }), transcribe: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e } })
  检查('取消与故障分开返回', (await 会取消.transcribe(Buffer.from([1]))).已取消 === true)
  检查('适配器接口冻结不可变', Object.isFrozen(ASR))

  const 默认状态 = await 默认ASR.status()
  检查('默认驱动是按需启动的 SenseVoice', 默认状态.在 && 默认状态.已配置 && 默认ASR.提供者 === 'sensevoice-local' && /首次录音时加载|已加载/.test(默认状态.说明))

  console.log(`\nASR 适配器：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
