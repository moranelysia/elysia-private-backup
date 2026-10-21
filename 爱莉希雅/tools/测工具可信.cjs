'use strict'

/**
 * 阶段 C+ / T2 固定离线回归入口。
 *
 * 用法：
 *   node tools\测工具可信.cjs
 *   npm run test:tools
 *
 * 这里只收确定性、无联网、无真实模型请求的代表路径。任一子测试退出非零，
 * 或者没有给出可核对的 N/N 汇总，都算整套失败。
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.dirname(项目根)
const 隔离数据 = path.join(工作区根, '_测试', '工具可信回归数据')
const 套件 = [
  ['搜索入口', '测联网搜索.cjs'],
  ['天气相关性', '测天气搜索.cjs'],
  ['搜索来源', '测搜索来源.cjs'],
  ['搜索材料门槛', '测搜索验证.cjs'],
  ['搜索冲突', '测搜索冲突.cjs'],
  ['读取范围', '测读取验证.cjs'],
  ['写后核对', '测写文件.cjs'],
  ['命令结果', '测命令结果.cjs'],
  ['命令产物', '测命令产物.cjs'],
  ['统一回执', '测工具回执.cjs'],
  ['工具记录', '测工具记录.cjs'],
  ['同轮顺序', '测工具顺序.cjs'],
]

function 安全清理() {
  const 目标 = path.resolve(隔离数据)
  const 测试根 = path.resolve(工作区根, '_测试') + path.sep
  if (!目标.startsWith(测试根)) throw new Error('拒绝清理非测试目录：' + 目标)
  fs.rmSync(目标, { recursive: true, force: true })
}

function 找汇总(输出) {
  const 匹配们 = [...String(输出 || '').matchAll(/(\d+)\s*\/\s*(\d+)/g)]
  if (!匹配们.length) return null
  const 最后 = 匹配们[匹配们.length - 1]
  return { 通过: Number(最后[1]), 总数: Number(最后[2]) }
}

function 主() {
  安全清理()
  fs.mkdirSync(隔离数据, { recursive: true })
  let 总通过 = 0
  let 总断言 = 0
  const 失败们 = []

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   工具可信固定回归（离线）')
  console.log('  ════════════════════════════════════════════')

  try {
    for (const [名称, 文件名] of 套件) {
      console.log(`\n  ── ${名称}：${文件名} ──`)
      const 文件 = path.join(__dirname, 文件名)
      const 结果 = spawnSync(process.execPath, [文件], {
        cwd: 项目根,
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          ELYSIA_DATA_DIR: 隔离数据,
          // 选入的搜索测试全部注入假 fetch；清空外部 Key，避免测试失误时沿用真实凭据。
          ELYSIA_SERPAPI_API_KEY: '',
          ELYSIA_SECURE_API_KEY: '',
          DEEPSEEK_API_KEY: '',
        },
      })
      const 标准输出 = String(结果.stdout || '')
      const 错误输出 = String(结果.stderr || '')
      if (标准输出) process.stdout.write(标准输出.endsWith('\n') ? 标准输出 : 标准输出 + '\n')
      if (错误输出) process.stderr.write(错误输出.endsWith('\n') ? 错误输出 : 错误输出 + '\n')

      const 汇总 = 找汇总(标准输出 + '\n' + 错误输出)
      const 退出正常 = 结果.status === 0 && !结果.error
      const 断言全过 = !!汇总 && 汇总.通过 === 汇总.总数 && 汇总.总数 > 0
      if (汇总) {
        总通过 += 汇总.通过
        总断言 += 汇总.总数
      }
      if (!退出正常 || !断言全过) {
        const 原因 = 结果.error ? 结果.error.message
          : !退出正常 ? `退出码 ${结果.status}`
          : '没有可核对的 N/N 汇总或断言未全过'
        失败们.push(`${文件名}：${原因}`)
      }
    }
  } finally {
    安全清理()
  }

  console.log('')
  console.log('  ════════════════════════════════════════════')
  if (失败们.length) {
    console.log(`   工具可信固定回归：${总通过}/${总断言}，${失败们.length} 个脚本失败`)
    for (const 一 of 失败们) console.log('   ✗ ' + 一)
  } else {
    console.log(`   工具可信固定回归：${总通过}/${总断言} ✓ 全过`)
  }
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exitCode = 失败们.length ? 1 : 0
}

try {
  主()
} catch (错误) {
  console.error('固定回归入口失败：' + (错误.stack || 错误.message))
  process.exitCode = 1
}
