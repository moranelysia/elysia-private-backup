/** TTS 适配层：全用假驱动，不连接声音服务。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const { 创建TTS, 默认TTS } = require(path.join(根, '脑', 'TTS.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  let 空驱动错 = ''
  try { 创建TTS() } catch (错误) { 空驱动错 = 错误.message }
  检查('拒绝空驱动', /不能为空/.test(空驱动错))
  let 缺状态错 = ''
  try { 创建TTS({ speak() {} }) } catch (错误) { 缺状态错 = 错误.message }
  检查('驱动必须实现 status', /status/.test(缺状态错))
  let 缺朗读错 = ''
  try { 创建TTS({ status() {} }) } catch (错误) { 缺朗读错 = 错误.message }
  检查('驱动必须实现 speak', /speak/.test(缺朗读错))

  let 收到超时 = null
  let 收到文字 = ''
  let 朗读次数 = 0
  const TTS = 创建TTS({
    id: 'fake-tts',
    status: async (超时) => { 收到超时 = 超时; return { 在: true, 忙: 2, 说明: '假服务在线' } },
    prepareText: (文字) => String(文字).replace(/\*/g, '').trim(),
    speak: async (文字) => {
      朗读次数++
      收到文字 = 文字
      return { 成功: true, 音频: Buffer.from('audio'), 类型: 'audio/wav', 用时: 1.25, 说明: '好了' }
    },
  })

  const 状态 = await TTS.status(345)
  检查('状态超时参数传给驱动', 收到超时 === 345)
  检查('状态结果统一并标注提供者', 状态.在 && 状态.忙 === 2 && 状态.提供者 === 'fake-tts')
  const 成功 = await TTS.speak('  **你好**  ')
  检查('朗读前统一清理文本', 收到文字 === '你好')
  检查('成功音频按统一结构返回', 成功.成功 && Buffer.isBuffer(成功.音频) && 成功.类型 === 'audio/wav' && 成功.提供者 === 'fake-tts')

  const 次数前 = 朗读次数
  const 空话 = await TTS.speak(' *** ')
  检查('清理后为空不会调用驱动', !空话.成功 && 朗读次数 === 次数前)

  const 流块们 = []
  const 流式TTS = 创建TTS({
    id: 'fake-stream',
    status: async () => ({ 在: true }),
    speak: async () => ({ 成功: true, 音频: Buffer.from('fallback') }),
    prepareText: (文字) => String(文字).replace(/\*/g, '').trim(),
    stream: async (文字, 选项) => {
      await 选项.收到音频(Buffer.from([1, 2]), { 采样率: 32000, 格式: 'pcm_s16le' })
      return { 成功: true, 类型: 'audio/pcm', 格式: 'pcm_s16le', 采样率: 32000, 字节数: 2, 说明: 文字 }
    },
  })
  const 流式成功 = await 流式TTS.stream(' **你好** ', { 收到音频: (块) => 流块们.push(...块) })
  检查('流式入口也先清理朗读文本', 流式成功.说明 === '你好')
  检查('PCM 音频块穿过适配层', 流块们.join(',') === '1,2' && 流式成功.采样率 === 32000)
  const 无流驱动 = 创建TTS({ status: async () => ({ 在: true }), speak: async () => ({ 成功: true, 音频: Buffer.from('x') }) })
  检查('普通驱动缺少流式实现时可识别回退', (await 无流驱动.stream('测试')).不支持 === true)

  const 服务拒绝 = 创建TTS({ id: 'reject', status: async () => ({ 在: false }), speak: async () => ({ 成功: false, 说明: '服务忙' }) })
  检查('驱动失败转成统一失败', !(await 服务拒绝.speak('你好')).成功 && (await 服务拒绝.speak('你好')).说明 === '服务忙')
  const 空音频 = 创建TTS({ id: 'empty', status: async () => ({ 在: true }), speak: async () => ({ 成功: true, 音频: Buffer.alloc(0) }) })
  检查('成功但没有音频按失败处理', /没有返回音频/.test((await 空音频.speak('你好')).说明))
  const 会抛错 = 创建TTS({ id: 'throw', status: async () => { throw new Error('状态炸了') }, speak: async () => { throw new Error('合成炸了') } })
  检查('状态异常被隔离', !(await 会抛错.status()).在 && /状态炸了/.test((await 会抛错.status()).说明))
  检查('合成异常被隔离', !(await 会抛错.speak('你好')).成功 && /合成炸了/.test((await 会抛错.speak('你好')).说明))
  检查('适配器接口冻结不可变', Object.isFrozen(TTS))
  检查('默认驱动明确为本机 GPT-SoVITS', 默认TTS.提供者 === 'gpt-sovits-local')
  检查('默认驱动把破折号转换成句号停顿', 默认TTS.prepareText('好呀——让我想想—现在说') === '好呀。让我想想。现在说')
  检查('默认驱动把音符转换成逗号停顿', 默认TTS.prepareText('你好呀♪让我看看♪️现在') === '你好呀，让我看看，现在')

  const 主进程 = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
  检查('主进程只依赖 TTS 适配接口', 主进程.includes("require(path.join(脑, 'TTS.cjs')).默认TTS") && !主进程.includes("require(path.join(脑, '语音.cjs'))"))
  检查('合成入口使用 TTS.speak', 主进程.includes('const 结果 = await TTS.speak(文字)'))
  检查('PCM 流入口只通过 TTS.stream', 主进程.includes('await TTS.stream(文字'))
  检查('所有声音状态检查使用 TTS.status', !主进程.includes('语音.在吗') && (主进程.match(/TTS\.status\(/g) || []).length >= 5)

  console.log(`\nTTS 适配器：${通过}/${总数} 通过`)
}

main().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
