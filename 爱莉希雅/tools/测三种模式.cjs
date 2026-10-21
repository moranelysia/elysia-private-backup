/**
 * 测三种模式.cjs —— 聊天 / 干活 / 学习，是不是真的各走各的
 *
 * 【为什么值得单写】
 *   加第三种模式最大的风险不是"崩"，是**漏**：
 *   代码里原来到处写着 `模式 === 'work'`，加模式的时候漏掉一处，
 *   表现就是"学习模式下她有时候能写文件、有时候不能"——
 *   不报错、不崩，只是行为怪，而且只有真用起来才会发现。
 *   所以每一处"该不该给她手"都要钉一遍。
 *
 * 【不花钱】"说话时走没走对模式"是拿假网截请求看的，
 *   直接读发出去的 system 提示里有没有那一段。
 *
 * 【测完会把对话索引原样放回去】—— 不然他会看见几段测试建的空对话。
 *
 * 用法: node tools\测三种模式.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')
const 配置 = require(path.join(脑, '配置.cjs'))
// 跟运行代码用同一份数据目录配置。测试传 ELYSIA_DATA_DIR 时必须完整隔离，
// 不能收尾时又把项目里的真实索引重写一遍。
const 索引路径 = path.join(配置.数据目录, '聊天记录', '对话索引.json')

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

const 编码器 = new TextEncoder()
function 编码(文字) {
  return 编码器.encode(文字)
}

/** 把 fetch 换成假的，只为把发出去的请求体捞下来看 */
function 装假网(抓到) {
  const 真网 = globalThis.fetch
  globalThis.fetch = async (_地址, 选项) => {
    try {
      抓到.push(JSON.parse(选项.body))
    } catch {
      抓到.push(null)
    }
    const 段 = [
      编码('data: ' + JSON.stringify({ choices: [{ delta: { content: '嗯嗯' } }] }) + '\n\n'),
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

/** 请求体里那条 system 提示（就是"你是谁"那一大叠纸） */
function 系统提示(体) {
  const 们 = (体 && 体.messages) || []
  const 条 = 们.find((m) => m.role === 'system')
  return (条 && typeof 条.content === 'string' && 条.content) || ''
}

async function 主() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   三种模式 —— 各走各的吗')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  let 原来的索引 = null
  try {
    原来的索引 = fs.readFileSync(索引路径, 'utf8')
  } catch {
    /* 本来就没有 */
  }

  try {
    const 记忆 = require(path.join(脑, '记忆.cjs'))
    const 对话 = require(path.join(脑, '对话.cjs'))
    const 提示词 = require(path.join(脑, '提示词.cjs'))

    // -------------------------------------------------------------
    console.log('  ── 一、模式跟着每段对话走 ──')

    const 甲 = 记忆.建新对话('', '', 'learn')
    检查('建的时候能记下模式', 记忆.这段的模式(甲) === 'learn', 记忆.这段的模式(甲))

    const 甲条 = 记忆.对话列表().find((x) => x.编号 === 甲)
    检查('列表里也带出来了（界面靠它标每段是什么模式）', !!(甲条 && 甲条.模式 === 'learn'), JSON.stringify(甲条))

    记忆.设这段的模式(甲, 'work')
    检查('能改（左侧模式行和托盘走的就是这条）', 记忆.这段的模式(甲) === 'work', 记忆.这段的模式(甲))

    const 乙 = 记忆.建新对话('', '', 'chat')
    检查('另一段不受影响', 记忆.这段的模式(乙) === 'chat')
    检查('  前一段还是 work', 记忆.这段的模式(甲) === 'work')

    记忆.建新对话('') // 不传模式
    检查('不传模式 → 记成空（老对话也是这样，交给调用方兜底）', 记忆.这段的模式() === '')

    检查('问一段不存在的 → 空，不报错', 记忆.这段的模式('根本没这段') === '')

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 二、"能不能动手"这个判断 ──')

    检查('聊天：不能动手', 提示词.能动手吗('chat') === false)
    检查('干活：能动手', 提示词.能动手吗('work') === true)
    检查('★ 学习：也能动手（她要读课件、写笔记、跑例子）', 提示词.能动手吗('learn') === true)

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 三、★ 说话时真的走对模式了吗（假网截请求）──')

    async function 跑一轮(模式) {
      const 抓到 = []
      const 收网 = 装假网(抓到)
      try {
        await 对话.说话({ 他说的话: '在吗', 历史: [], 模式 })
      } finally {
        收网()
      }
      return 系统提示(抓到[0])
    }

    const 聊天的 = await 跑一轮('chat')
    const 干活的 = await 跑一轮('work')
    const 学习的 = await 跑一轮('learn')

    检查('聊天那份只开放联网搜索和本机时间', 聊天的.includes('联网搜索和本机时间') && 聊天的.includes('【查】') && 聊天的.includes('【时间】'), 聊天的.slice(0, 80))
    检查('★ 聊天那份里**没有**"陪他学"', !聊天的.includes('陪他学'))
    检查('★ 聊天那份里没有文件和命令工具', !聊天的.includes('【读】') && !聊天的.includes('【写】') && !聊天的.includes('【跑】'))

    检查('干活那份里有"干活"那一段', 干活的.includes('这个模式：干活'))
    检查('★ 干活那份里**没有**"陪他学"', !干活的.includes('陪他学'))

    检查('★ 学习那份里有"这个模式：陪他学"', 学习的.includes('这个模式：陪他学'))
    检查('  "你要的是他弄懂，不是你把答案给他"这句在', 学习的.includes('你要的是他弄懂'))
    检查('★ 学习那份里**给了工具**（她得能读课件、写笔记）', 学习的.includes('你手上有什么'))
    检查('★ 学习那份里写了学习区在哪', 学习的.includes(提示词.学习区根), 提示词.学习区根)
    检查('  说了材料默认只读不改', 学习的.includes('只读不改'))
    检查('  说了记笔记要问他', 学习的.includes('问他要不要记下来'))

     // 给她的"记忆"那一段三种模式都要有 —— 不然她换个模式就不认识他了
     for (const [名, 那份] of [['聊天', 聊天的], ['干活', 干活的], ['学习', 学习的]]) {
      检查(`  ${名}模式里带着"关于眼前的人"`, 那份.includes('关于眼前的人'))
    }

    // -------------------------------------------------------------
    console.log('')
    console.log('  ── 四、认不出来的模式名怎么办 ──')

    const 乱的 = await 跑一轮('这是个瞎写的模式')
    检查('★ 瞎写的名字 → 当聊天处理（只给联网搜索和时间）', 乱的.includes('联网搜索和本机时间') && 乱的.includes('【时间】') && !乱的.includes('【读】'))
    检查('  也没当成学习', !乱的.includes('陪他学'))
  } finally {
    try {
      if (原来的索引 === null) fs.rmSync(索引路径, { force: true })
      else fs.writeFileSync(索引路径, 原来的索引, 'utf8')
    } catch (错误) {
      console.log('  ⚠ 索引没还原成功，你自己看一眼：' + 错误.message)
    }
  }

  console.log('')
  {
    let 现在 = null
    try {
      现在 = fs.readFileSync(索引路径, 'utf8')
    } catch {
      现在 = null
    }
    检查('他的对话索引原样放回去了（没留下测试建的空对话）', 现在 === 原来的索引)
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
