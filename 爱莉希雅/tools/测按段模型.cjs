/**
 * 测按段模型.cjs —— "这一段用哪个脑子"存下来了吗、读得出来吗、真传下去了吗
 *
 * 【为什么值得单写】
 *   这东西坏了**不报错**：模型名存丢了，那一段就还是用默认模型回话，
 *   而默认模型也能好好回话 —— 他只会某天觉得"我明明选了 flash，怎么说话不像"。
 *   这种"安静地不生效"必须每一格都钉死。
 *
 * 【为什么测完要把索引原样放回去】
 *   建新对话是往他**真正的** 记忆\聊天记录\对话索引.json 里写的。
 *   测试往里塞几段假的，他一打开软件就会看见几段空对话，
 *   而且会以为是自己建的。所以测完必须一个字不差地放回去。
 *
 * 【为什么不用真请求验"模型传下去了"】
 *   用一个不存在的模型名去打真接口，虽然会 400，但**报错里未必带那个名字** ——
 *   那就等于什么都没验到。
 *   所以改成把 fetch 换成假的，直接看**发出去的请求体**里 model 是哪个。
 *   这样既准，又不花钱。
 *
 * 用法: node tools\测按段模型.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')
const 索引路径 = path.join(项目根, '记忆', '聊天记录', '对话索引.json')

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
//  假网：把 fetch 换掉，只为了看"请求体里的 model 是哪个"
// ---------------------------------------------------------------
const 编码器 = new TextEncoder()
function 编码(文字) {
  return 编码器.encode(文字)
}

/**
 * 把 fetch 换成假的。
 * @param {string[]} 抓到 每发一次请求，就把里面的 model 记进来
 * @returns {() => void} 拆掉假网、把真 fetch 装回去
 *
 * 【为什么必须还一个"拆"出来】
 *   第一版忘了拆，结果后面测"问模型名单"那一段也走了假网 ——
 *   假回应没有 .json() 方法，于是它走的是"问不到"的兜底分支，
 *   而兜底分支**也设计成不会报错**，所以测试照样全绿。
 *   那就等于：真路子一次都没验过，而报告上写着"全过"。
 *   （这一格是这次真踩出来的。）
 */
function 装假网(抓到) {
  const 真网 = globalThis.fetch
  globalThis.fetch = async (_地址, 选项) => {
    let 体 = null
    try {
      体 = JSON.parse(选项.body)
    } catch {
      /* 不是 JSON 就算了 */
    }
    抓到.push(体 ? 体.model : '(读不出请求体)')

    const 段 = [
      编码('data: ' + JSON.stringify({ choices: [{ delta: { content: '嗯，我在呢' } }] }) + '\n\n'),
      编码('data: [DONE]\n\n'),
    ]
    let 号 = 0
    return {
      ok: true,
      status: 200,
      text: async () => '',
      body: {
        getReader: () => ({
          read: async () => (号 < 段.length ? { done: false, value: 段[号++] } : { done: true }),
        }),
      },
    }
  }
  return () => {
    globalThis.fetch = 真网
  }
}

async function 主() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   每段对话各用一个模型 —— 存得住吗、真用上了吗')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  // ---- 先把他的索引原样抄一份，测完放回去 ----
  let 原来的索引 = null
  try {
    原来的索引 = fs.readFileSync(索引路径, 'utf8')
  } catch {
    原来的索引 = null // 本来就没有这个文件
  }

  try {
    const 记忆 = require(path.join(脑, '记忆.cjs'))
    const 对话 = require(path.join(脑, '对话.cjs'))

    // -------------------------------------------------------------
    console.log('  ── 一、建的时候存下来了吗 ──')

    const 甲 = 记忆.建新对话('', 'deepseek-flash')
    检查('建完能读回来', 记忆.这段的模型(甲) === 'deepseek-flash', 记忆.这段的模型(甲))

    const 甲条 = 记忆.对话列表().find((x) => x.编号 === 甲)
    检查('列表里也带着它（界面靠这个标出来）', !!(甲条 && 甲条.模型 === 'deepseek-flash'), JSON.stringify(甲条))

    const 乙 = 记忆.建新对话('测试用的')
    检查('不传模型 → 记成空（意思是"跟着默认走"）', 记忆.这段的模型(乙) === '', 记忆.这段的模型(乙))
    const 乙条 = 记忆.对话列表().find((x) => x.编号 === 乙)
    检查('  列表里也是空', !!(乙条 && 乙条.模型 === ''), JSON.stringify(乙条))

    检查('问一段不存在的 → 空，不报错', 记忆.这段的模型('根本没这段') === '')

    // 老索引里那些段（没有模型字段）读出来也该是空，不能变成 undefined
    检查('没指定过的段读出来是空字符串，不是 undefined', typeof 记忆.这段的模型(乙) === 'string')

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 二、★ 指定的模型真的走进了请求里吗 ──')

    const 抓到的 = []
    const 收网1 = 装假网(抓到的)
    try {
      await 对话.说话({
        他说的话: '在吗',
        历史: [],
        模式: 'chat', // 聊天模式只有一轮请求，干净
        模型: 'deepseek-flash',
      })
    } finally {
      收网1()
    }
    检查('★ 说话() 指定的模型，请求体里就是它', 抓到的[0] === 'deepseek-flash', JSON.stringify(抓到的))

    const 抓到的2 = []
    const 收网2 = 装假网(抓到的2)
    try {
      await 对话.说话({ 他说的话: '在吗', 历史: [], 模式: 'chat' })
    } finally {
      收网2()
    }
    检查(
      '不指定的时候，用的是默认那个（' + 对话.模型 + '）',
      抓到的2[0] === 对话.模型,
      JSON.stringify(抓到的2),
    )

    // 直接问 要一轮 也要吃这个参数（子代理那条路走的就是它）
    const 抓到的3 = []
    const 收网3 = 装假网(抓到的3)
    try {
      await 对话.要一轮({ 消息们: [{ role: 'user', content: '在吗' }], 模型: 'deepseek-v4-pro' })
    } finally {
      收网3()
    }
    检查('★ 要一轮() 也认这个参数（子代理走的是这条路）', 抓到的3[0] === 'deepseek-v4-pro', JSON.stringify(抓到的3))

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 三、问模型名单那个接口 ──')

    // 真的问一次 /models（不花钱）。问不到也算过 —— 网断了不该算代码错。
    const 名单果 = await 对话.有哪些模型()
    检查('有哪些模型() 有返回，而且带着"现在用的"', !!名单果 && typeof 名单果.现在用的 === 'string', JSON.stringify(名单果))
    检查('  名单里至少有一个（问不到时会兜底放默认那个）', Array.isArray(名单果.名单) && 名单果.名单.length > 0, JSON.stringify(名单果.名单))
    检查('  兜底的时候也说得清为什么', 名单果.好 === true || !!名单果.说明, JSON.stringify({ 好: 名单果.好, 说明: 名单果.说明 }))
    if (名单果.好) {
      console.log('      名单：' + 名单果.名单.join('、'))
    } else {
      console.log('      （问不到：' + 名单果.说明 + '）')
    }
  } finally {
    // ---- 一个字不差地放回去 ----
    try {
      if (原来的索引 === null) fs.rmSync(索引路径, { force: true })
      else fs.writeFileSync(索引路径, 原来的索引, 'utf8')
    } catch (错误) {
      console.log('  ⚠ 索引没还原成功，你得自己看一眼：' + 错误.message)
    }
  }

  console.log('')
  console.log('  ── 四、收尾 ──')
  {
    // 重新读一遍（模块缓存里那份可能还是改过的，所以直接读文件）
    let 现在 = null
    try {
      现在 = fs.readFileSync(索引路径, 'utf8')
    } catch {
      现在 = null
    }
    检查('他的对话索引原样放回去了（没留下测试用的空对话）', 现在 === 原来的索引)
  }

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}`)
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

主().catch((错误) => {
  console.log('  ✗ 测试自己炸了：' + (错误 && 错误.stack))
  process.exit(1)
})
