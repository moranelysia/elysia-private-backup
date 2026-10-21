/**
 * 看上下文.cjs —— 把"她一次请求要发多少东西"摊开给你看
 *
 * 【为什么值得单独一个脚本】
 *   上下文管理是"看不见的"——超了不会报错，只会变慢、变贵、变糊涂。
 *   所以第一步不是压缩，是**让它看得见**：到底哪一块在吃钱。
 *
 *   这个脚本把三件事并排量出来：
 *     · 固定成本（她是谁 + 工具说明书，每次都发）
 *     · 对话历史（越聊越长）
 *     · 干活时那一圈工具结果（最危险的地方）
 *
 *   它不碰任何文件，也不发请求，纯算。
 *
 * 用法: node tools\看上下文.cjs
 */
'use strict'

const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')

const 尺 = require(path.join(脑, '量长度.cjs'))
const 提示词 = require(path.join(脑, '提示词.cjs'))
const 记忆 = require(path.join(脑, '记忆.cjs'))
const 工具表 = require(path.join(脑, '工具表.cjs'))
const 路径安全 = require(path.join(脑, '路径安全.cjs'))
const 命令工具 = require(path.join(脑, '工具', '命令工具.cjs'))

/** 模型的上下文窗口（deepseek-chat 是 64K） */
const 窗口 = 65536

/** 输出要留多少地方 */
const 输出预留 = 8000

/** 印一行：名字、字数、估出来的 token、占窗口多少 */
function 行(名, 字数, tok, 备注 = '') {
  console.log(
    '  ' +
      名.padEnd(20) +
      String(字数).padStart(7) +
      ' 字' +
      String(tok).padStart(8) +
      ' tok' +
      ((tok / 窗口) * 100).toFixed(1).padStart(7) +
      '%   ' +
      备注,
  )
  return tok
}

/** 量一段真文字 */
function 量(名, 文本, 备注 = '') {
  return 行(名, String(文本 || '').length, 尺.估(文本), 备注)
}

/** 量"如果是 N 个汉字那么长"（不真的造那串字，免得打印出来） */
function 量n(名, 字数, 备注 = '') {
  return 行(名, 字数, Math.ceil(字数 * 0.6), 备注)
}

function main() {
  console.log('')
  console.log('  ══════════════════════════════════════════════════════════════')
  console.log('   她一次请求要发多少东西   窗口 ' + 窗口 + '   输出预留 ' + 输出预留)
  console.log('  ══════════════════════════════════════════════════════════════')
  console.log('')

  路径安全.注册({ 项目根, 工作区根: path.resolve(项目根, '..') })
  const 片段 = 记忆.取记忆()
  const 工作区 = path.resolve(项目根, '..')

  const 工具说明 = 工具表.拼工具说明()
  const 环境说明 = 命令工具.环境说明()
  const 范围说明 = 路径安全.拼范围说明()

  const chat提示 = 提示词.拼({ ...片段, 模式: 'chat', 工作区, 工具说明: '', 环境说明: '', 范围说明: '' })
  const work提示 = 提示词.拼({ ...片段, 模式: 'work', 工作区, 工具说明, 环境说明, 范围说明 })
  const 时间条 = 提示词.拼时间()

  // -------------------------------------------------------------
  console.log('  ── 一、固定成本（每次都发，永远不变）──')
  const 工 = 量('工具说明', 工具说明)
  const 环 = 量('环境说明', 环境说明)
  const 范 = 量('范围说明', 范围说明)
  console.log('  ' + '↑ 这三样只有干活模式才有'.padEnd(20) + ' 小计 ' + (工 + 环 + 范) + ' tok')
  console.log('')
  const chat固 = 量('chat 系统提示', chat提示)
  const work固 = 量('work 系统提示', work提示)
  量('时间那条', 时间条)
  console.log('')
  console.log('  两个固定的差：' + (work固 - chat固) + ' tok')
  console.log('  → **干活模式一开口，就比聊天多花这么多**，跟聊什么都无关')

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 二、对话历史（越聊越长）──')
  const 这一段 = 记忆.读最近聊天(0)
  const 现在给的 = 记忆.读最近聊天(10)
  const 拼 = (条们) => 条们.map((t) => String(t.内容 || '')).join('\n')

  console.log('  这一段一共 ' + 这一段.length + ' 条')
  const 现 = 量(`现在给她的 ${现在给的.length} 条`, 拼(现在给的))
  const 全 = 量(`要是全给她（${这一段.length} 条）`, 拼(这一段), '多花这些，但她才看得见全部')
  console.log('')
  console.log('  → 我们现在把历史的 ' + ((现 / 全) * 100).toFixed(0) + '% 掐掉了')
  console.log('  → 全给的话每句多花 ' + (全 - 现) + ' tok ≈ ' + (((全 - 现) * 0.5) / 1e6 * 100).toFixed(2) + ' 分钱（按缓存价）')

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 三、干活时最危险的地方：工具结果 ──')
  console.log('  （聊天模式没有这一段。干活一轮最多 3 回合 × 每回合 3 个工具）')
  console.log('')
  const 读上限 = 20000
  const 跑上限 = 30000
  const 读估 = 量n('[读:] 单次最多', 读上限)
  const 跑估 = 量n('[跑:] 单次最多', 跑上限)
  console.log('')
  const 最坏估 = 量n('一轮最坏（9 次都满）', 9 * 跑上限)
  const 余量 = 窗口 - 输出预留 - work固 - 现
  console.log('')
  console.log('  → 整个窗口才 ' + 窗口 + '，上面那个最坏是它的 ' + (最坏估 / 窗口).toFixed(1) + ' 倍')
  console.log('  → 干活模式真正留给"对话 + 工具结果"的余量：' + 余量 + ' tok')
  console.log('  → 换算成满格的 [跑:] 输出：**' + Math.floor(余量 / 跑估) + ' 个就撑爆**')
  console.log('  → 换算成满格的 [读:] 输出：**' + Math.floor(余量 / 读估) + ' 个就撑爆**')
  console.log('')
  console.log('  而且现在**没有任何一处在数它**——`对话.cjs` 里没有"太长了"这个判断。')

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 四、这把尺子现在准不准 ──')
  //
  // 尺子自己会纠偏：每次请求完，拿模型报的真数跟估算对一次账。
  // 这里看的就是那本账。

  const 准 = 尺.尺子准吗()
  if (!准.条数) {
    console.log('  还没有对过账 —— 跟她说句话就开始了（聊天模式也算）')
    console.log('')
    console.log('  在那之前，唯一的依据是这一条：')
    console.log('    她的系统提示 14211 字 ↔ 账本里那次缓存命中 7296 tok')
    console.log('    → 大约 1.95 字 / token；这把尺子按中文 1.7 字/token，是一个量级')
  } else {
    console.log('  对过 ' + 准.条数 + ' 次账')
    console.log('    平均比值 ' + 准.平均比值 + '（实际 ÷ 估算）')
    console.log('    中位比值 ' + 准.中位比值 + '（做决定看这个，它不怕个别离谱的）')
    console.log('    → ' + 准.说法)
    console.log('')
    if (准.修正 === null) {
      console.log('  修正系数还不敢用（至少攒 ' + 10 + ' 条才开始）')
    } else {
      console.log('  现在估长度会乘上修正系数 ' + 准.修正)
    }

    // 最近几条摊开看看 —— 一眼看出是哪一种请求偏得厉害
    const 最近 = 尺.读对账(8)
    if (最近.length) {
      console.log('')
      console.log('  最近 ' + 最近.length + ' 笔：')
      for (const 一 of 最近) {
        console.log(
          '    ' +
            一.时间 +
            '  纯估 ' +
            String(一.纯估).padStart(6) +
            '  实际 ' +
            String(一.实际).padStart(6) +
            '  比值 ' +
            String(一.比值).padStart(5) +
            '  ' +
            (一.靠 || '') +
            '  ' +
            (一.备注 || ''),
        )
      }
      console.log('')
      console.log('  （"靠"那一栏说明这个数是怎么来的：真数锚 / 修正系数 / 纯估）')
    }
  }

  console.log('')
  console.log('  ══════════════════════════════════════════════════════════════')
  console.log('')
}

main()
