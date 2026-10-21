/**
 * 量内存.cjs —— 盯着声音服务的内存，看它是"稳住"还是"一直涨"
 *
 * 【为什么要专门做这个】
 *   他问："你说 python 占一千多兆，可我这三千多兆，这是异常吗？"
 *
 *   光看一个数字是答不上来的 —— 内存大不等于漏。要分两种情况：
 *
 *     正常：加载完就稳住   （3 GB 一直 3 GB，说几句话也还是 3 GB）
 *     漏了：每说一句就涨   （3 GB → 3.2 → 3.4 …… 从不见回落）
 *
 *   所以能回答这个问题的不是"某个时刻的数字"，是**一段时间里的曲线**。
 *   这个脚本就是去画那条曲线。
 *
 *   我引用过的 1537 / 1654 / 3659 都是快照 —— 现在回头看，
 *   那句话说得太肯定了。以后这种事让它自己说。
 *
 * 用法: node tools\量内存.cjs              每分钟记一次，记 10 次（10 分钟）
 *       node tools\量内存.cjs 30           记 30 次
 *       node tools\量内存.cjs 20 0.5       20 次，每次隔半分钟
 *
 * 【在我（DSH）那边跑不了】
 *   它要问系统的进程清单（WMI），而我的沙箱把这条路堵了
 *   （spawnSync powershell EPERM）。所以这个脚本要在**他的终端**里跑。
 */
'use strict'

const { execFileSync } = require('node:child_process')

const 次数 = parseInt(process.argv[2], 10) || 10
const 间隔分钟 = parseFloat(process.argv[3]) || 1

/** 问系统：python 进程占了多少（按命令行认出"声音服务"那个） */
function 量一次() {
  const 脚本 = [
    "$ErrorActionPreference='SilentlyContinue'",
    'Get-CimInstance Win32_Process |',
    "  Where-Object { $_.Name -match 'python' } |",
    '  ForEach-Object {',
    '    $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue',
    '    if ($p) { "$($_.ProcessId)`t$([math]::Round($p.WorkingSet64/1MB))`t$($_.CommandLine)" }',
    '  }',
  ].join('\n')

  const 出 = execFileSync('powershell', ['-NoProfile', '-Command', 脚本], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 20000,
  })

  const 找到 = []
  for (const 行 of 出.split('\n')) {
    const 净 = 行.replace(/\r$/, '')
    if (!净.trim()) continue
    const 段 = 净.split('\t')
    if (段.length < 2) continue
    找到.push({
      编号: parseInt(段[0], 10),
      内存MB: parseInt(段[1], 10),
      命令行: 段[2] || '',
    })
  }

  // 只认声音服务（命令行里有 api_v2.py），别的 python 不算
  return 找到.filter((p) => /api_v2\.py/i.test(p.命令行))
}

function 时刻() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return `${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`
}

async function main() {
  console.log('')
  console.log('  ============================================')
  console.log('   盯着声音服务的内存')
  console.log('  ============================================')
  console.log('')
  console.log(`  每 ${间隔分钟} 分钟记一次，一共 ${次数} 次`)
  console.log('  这期间你正常跟她说话（说几句，让它真的合成过声音）')
  console.log('  想停就按 Ctrl+C。')
  console.log('')
  console.log('  时刻        内存        比上一次')
  console.log('  ──────────────────────────────────')

  const 记录 = []
  let 上一次 = null

  for (let i = 0; i < 次数; i++) {
    let 这次 = null
    try {
      const 们 = 量一次()
      这次 = 们.length ? 们[0] : null
    } catch (错误) {
      console.log('  ✗ 量不到: ' + 错误.message.split('\n')[0])
      break
    }

    if (!这次) {
      console.log(`  ${时刻()}    没在跑`)
      if (i === 0) {
        console.log('')
        console.log('  （声音服务没起来。先双击桌面图标，或者 tools\\voice\\start-voice-only.cmd）')
        return
      }
    } else {
      const 差 = 上一次 === null ? '' : (这次.内存MB - 上一次 >= 0 ? '+' : '') + (这次.内存MB - 上一次) + ' MB'
      console.log(`  ${时刻()}    ${String(这次.内存MB).padStart(6)} MB   ${差}`)
      记录.push(这次.内存MB)
      上一次 = 这次.内存MB
    }

    if (i < 次数 - 1) await new Promise((停) => setTimeout(停, 间隔分钟 * 60 * 1000))
  }

  // ---- 给个结论，别让他自己看数字 ----
  console.log('')
  console.log('  ══════════════════════════════════════')

  if (记录.length < 3) {
    console.log('  记的次数太少，看不出趋势。多记几次再来。')
    return
  }

  const 头 = 记录.slice(0, 3).reduce((a, b) => a + b, 0) / 3
  const 尾 = 记录.slice(-3).reduce((a, b) => a + b, 0) / 3
  const 涨 = 尾 - 头
  const 涨的百分比 = 头 > 0 ? (涨 / 头) * 100 : 0

  console.log(`  开头三次平均 ${Math.round(头)} MB`)
  console.log(`  最后三次平均 ${Math.round(尾)} MB`)
  console.log(`  变化 ${涨 >= 0 ? '+' : ''}${Math.round(涨)} MB（${涨的百分比 >= 0 ? '+' : ''}${涨的百分比.toFixed(1)}%）`)
  console.log('')

  if (涨的百分比 < 5) {
    console.log('  ✓ 稳住了 —— 这是正常的。')
    console.log('    这套东西加载四个模型（磁盘上就 1050 MB），膨胀完在内存里')
    console.log('    两三 G 是它的正常体积。占得多不等于漏。')
  } else if (涨的百分比 < 20) {
    console.log('  ~ 有点涨，但不算吓人。')
    console.log('    可能是中间合成过几句（每次推理会申请一块显存/内存，用完不还给系统）。')
    console.log('    再量一会儿；要是继续线性往上涨，那就是真漏了。')
  } else {
    console.log('  ✗ 一直在涨，不像正常波动。')
    console.log('    真是这种情况的话：说几句话就重启一次声音服务最省事。')
    console.log('    （托盘那朵花右键 → 全部关掉，再双击桌面图标）')
  }
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
