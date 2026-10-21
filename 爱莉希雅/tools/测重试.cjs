/**
 * 测重试.cjs —— 网抖一下，她还会不会自己接上
 *
 * 【怎么测的】
 *   真发请求去试"断了会怎样"是试不出来的 —— 你没法让 DeepSeek 中途断给你看。
 *   所以这个脚本把全局的 fetch **换成一个假的**：
 *   剧本写好第几次该怎么答（正常吐字 / 报 429 / 吐一半断掉 / 干脆不吭声），
 *   然后看 要一轮() 怎么办。
 *
 *   换 fetch 是安全的：只在这一个进程里换，跑完就没了，不碰真网络，不花钱。
 *
 * 【最要紧的两格】
 *   · 她已经吐了半句在屏幕上 → **绝不许重试**（重试会让她把同一句话说两遍）
 *   · 一个字都没吐出来就断了 → 该重试（尤其是干活那一轮，前面几次的
 *     工具结果全押在这一趟上，废掉就得从头再来）
 *
 * 用法: node tools\测重试.cjs
 */
'use strict'

// 【必须在 require 对话.cjs 之前设】
// 首字节超时平时是 30 秒，测一次要干等半分钟。缩成 0.3 秒。
process.env.ELYSIA_首字节超时 = '300'

const 对话 = require('../脑/对话.cjs')

let 过了 = 0
let 总数 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (条件) {
    过了++
    console.log(`  ✓ ${说明}`)
  } else {
    console.log(`  ✗ ${说明}${细节 ? '   → ' + 细节 : ''}`)
  }
}

// ---------------------------------------------------------------
//  假网的道具
// ---------------------------------------------------------------
const 编码器 = new TextEncoder()
function 编码(文字) {
  return 编码器.encode(文字)
}

function 数据包(obj) {
  return 编码('data: ' + JSON.stringify(obj) + '\n\n')
}

/** 一次正常的流式回答 */
function 好回应(全文) {
  const 半 = Math.ceil(全文.length / 2)
  const 段 = [
    数据包({ choices: [{ delta: { content: 全文.slice(0, 半) } }] }),
    数据包({ choices: [{ delta: { content: 全文.slice(半) } }] }),
    数据包({ usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }),
    编码('data: [DONE]\n\n'),
  ]
  let 号 = 0
  return () => ({
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => (号 < 段.length ? { done: false, value: 段[号++] } : { done: true }),
      }),
    },
  })
}

/** 对面回了个错误码 */
function 坏回应(状态码, 文字) {
  return () => ({ ok: false, status: 状态码, text: async () => 文字, body: null })
}

/** 吐了半句，然后连接断了 */
function 断线回应(先吐) {
  let 号 = 0
  const 段 = [数据包({ choices: [{ delta: { content: 先吐 } }] })]
  return () => ({
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => {
          if (号 < 段.length) return { done: false, value: 段[号++] }
          const 里 = new Error('other side closed')
          里.code = 'UND_ERR_SOCKET'
          const 外 = new TypeError('terminated')
          外.cause = 里
          throw 外
        },
      }),
    },
  })
}

/** 一个字都不回，就那么挂着（等被掐）
 *  【注意】这是个"造剧本格"的函数 —— 得先调一次 哑巴回应() 拿到那一格，
 *  别把函数本身塞进剧本里（塞错了的话，要一轮 拿到的"回应"是个函数，
 *  第一句就读 .ok 读到 undefined，报出来的是"回应.text is not a function"，
 *  跟真正的毛病八竿子打不着 —— 我在这上面栽过一次）。*/
function 哑巴回应() {
  return (选项) => ({
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: () =>
          new Promise((_, 拒) => {
            const 信号 = 选项 && 选项.signal
            if (!信号) return // 没人掐就永远挂着（这个测试会超时 —— 那就是出问题了）
            信号.addEventListener('abort', () => {
              const 错 = new Error('This operation was aborted')
              错.name = 'AbortError'
              拒(错)
            })
          }),
      }),
    },
  })
}

/** 网络层直接炸（连都没连上） */
function 网炸了(码) {
  return () => {
    const 里 = new Error('read ' + 码)
    里.code = 码
    const 外 = new TypeError('fetch failed')
    外.cause = 里
    throw 外
  }
}

/** 他按了停 */
function 他喊停() {
  return () => {
    const 错 = new Error('This operation was aborted')
    错.name = 'AbortError'
    throw 错
  }
}

// 换掉全局 fetch。剧本用完就一直重复最后一格（用来做"一直坏"）。
let 用了几个 = 0
function 装网(剧本) {
  用了几个 = 0
  globalThis.fetch = async (_地址, 选项) => {
    const 格 = 剧本[Math.min(用了几个, 剧本.length - 1)]
    用了几个++
    return 格(选项)
  }
}

/** 跑一轮，成败都收成一个结果，别让异常打断整个测试 */
async function 试一轮(选项) {
  try {
    const 果 = await 对话.要一轮({
      消息们: [{ role: 'user', content: '在吗' }],
      ...选项,
    })
    return { 成了: true, 全文: 果.全文, 用了: 果.用了 }
  } catch (错误) {
    return { 成了: false, 错误 }
  }
}

// ---------------------------------------------------------------
async function 主() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   她这一轮碰上网络 —— 会自己接上吗')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  // -------------------------------------------------------------
  console.log('  ── 一、抖一下就好的那种 ──')

  装网([网炸了('ECONNRESET'), 好回应('我在这儿呢')])
  const 甲 = await 试一轮({})
  检查('网抖一下，第二次接上了', 甲.成了 && 甲.全文 === '我在这儿呢', JSON.stringify(甲))
  检查('  一共发了 2 次请求', 用了几个 === 2, String(用了几个))

  // 用量包有没有跟着回来（重试之后别把账丢了）
  检查('  真数（用了多少 token）没丢', !!(甲.用了 && 甲.用了.total_tokens === 120))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 二、一直抖：试够次数就认，但不能不吭声 ──')

  装网([网炸了('ECONNRESET')])
  const 乙 = await 试一轮({})
  检查('一直连不上 → 最后是失败的', !乙.成了)
  检查('  试满了 3 次才放弃', 用了几个 === 3, String(用了几个))
  检查('  错里标着"网"', 乙.错误 && 乙.错误.种类 === '网', 乙.错误 && 乙.错误.种类)
  检查('  说法是句中国话', 乙.错误 && /连不上模型那边/.test(乙.错误.message), 乙.错误 && 乙.错误.message)
  检查('  并且告诉了他试了几次', 乙.错误 && /试了 3 次/.test(乙.错误.message), 乙.错误 && 乙.错误.message)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 三、钥匙不对 / 欠费：一次就停（再试一百次也一样）──')

  装网([坏回应(401, 'Authentication Fails')])
  const 丙 = await 试一轮({})
  检查('钥匙不对 → 只发 1 次', 用了几个 === 1, String(用了几个))
  检查('  说法会引导去设置检查', 丙.错误 && /设置/.test(丙.错误.message), 丙.错误 && 丙.错误.message)

  装网([坏回应(402, 'Insufficient Balance')])
  const 丁 = await 试一轮({})
  检查('欠费 → 只发 1 次', 用了几个 === 1, String(用了几个))
  检查('  说法里说了要充值', 丁.错误 && /充值/.test(丁.错误.message), 丁.错误 && 丁.错误.message)

  装网([坏回应(400, 'bad request: messages is required')])
  const 戊 = await 试一轮({})
  检查('请求写错了 → 只发 1 次', 用了几个 === 1, String(用了几个))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 四、对面忙 / 对面抽风：等一等，试到成 ──')

  装网([坏回应(429, 'rate limited'), 坏回应(429, 'rate limited'), 好回应('好啦好啦')])
  const 己 = await 试一轮({})
  检查('429 连着两次，第三次成了', 己.成了 && 己.全文 === '好啦好啦', JSON.stringify(己))
  检查('  一共发了 3 次', 用了几个 === 3, String(用了几个))

  装网([坏回应(503, 'server busy'), 好回应('缓过来了')])
  const 庚 = await 试一轮({})
  检查('503 之后接上了', 庚.成了 && 庚.全文 === '缓过来了')

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 五、★ 已经吐了半句在屏幕上：绝不许重试 ──')

  const 吐出去的 = []
  装网([断线回应('我看看啊'), 好回应('这句话不该出现')])
  const 辛 = await 试一轮({ 吐字: (t) => 吐出去的.push(t) })
  检查('吐了一半就断 → 这一轮就是失败了', !辛.成了)
  检查('  ★ 没有再发第二次（不许把话说两遍）', 用了几个 === 1, String(用了几个))
  检查('  他确实看到过那半句', 吐出去的.length > 0 && 吐出去的[0].includes('我看看啊'), JSON.stringify(吐出去的))
  检查('  第二份回答没有漏出去', !吐出去的.some((t) => t.includes('不该出现')))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 六、★ 一个字都没吐出来就断了：该重试 ──')

  // 干活模式：她第一轮常常是"先说一句 + 直接甩工具标记"。
  // 只说到动手为止 → 屏幕上其实是空的 → 重试不会重复任何东西。
  const 吐出去的2 = []
  装网([断线回应('[读:D:\\新建文件夹\\爱莉希雅\\package.json]'), 好回应('读完了')])
  const 壬 = await 试一轮({ 只说到动手为止: true, 吐字: (t) => 吐出去的2.push(t) })
  检查('屏幕还空着的时候断了 → 自己接上了', 壬.成了 && 壬.全文 === '读完了', JSON.stringify(壬))
  检查('  一共发了 2 次请求', 用了几个 === 2, String(用了几个))
  检查('  第一趟没吐东西出去（所以他没看见重复）', !吐出去的2.some((t) => t.includes('读:')), JSON.stringify(吐出去的2))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 七、他按了停：不许重试，也不许包装成"出错" ──')

  装网([他喊停(), 好回应('不该说话')])
  const 癸 = await 试一轮({})
  检查('按停之后就不发了', 用了几个 === 1, String(用了几个))
  检查('  原样的 AbortError 抛上去（上层还认这个名字）', 癸.错误 && 癸.错误.name === 'AbortError', 癸.错误 && 癸.错误.name)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 八、★ 一个字都不回（挂了 30 秒）：掐掉重来 ──')

  const 开始 = Date.now()
  装网([哑巴回应(), 好回应('来了来了')])
  const 子 = await 试一轮({})
  const 花了 = Date.now() - 开始
  检查('哑巴了 0.3 秒就被掐掉，然后接上了', 子.成了 && 子.全文 === '来了来了', JSON.stringify(子))
  检查('  一共发了 2 次请求', 用了几个 === 2, String(用了几个))
  检查('  没有真的干等 30 秒', 花了 < 5000, 花了 + ' 毫秒')

  // 这一格盯的是我差点写错的地方：
  // 超时也是 abort 出来的，长得跟"他按了停"一模一样。
  // 判错成"按停"的话，它就不会重试了 —— 那上面这一格会挂。
  检查('  超时没被当成"他按了停"（所以才会重试）', 用了几个 === 2)

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}`)
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

主().catch((错误) => {
  console.log('')
  console.log('  ✗ 测试自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
