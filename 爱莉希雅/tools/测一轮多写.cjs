/**
 * 测一轮多写.cjs —— 一轮里让她写两个文件，把确认那条路走通
 *
 * 【为什么单独一个】
 *   2026-10-01 的现场：她一轮里点了两个文件，程序并行去写，
 *   第一个挂起等答复，第二个被当成"他不同意"（因为他压根没看见那张卡）。
 *   修完之后（脑\确认.cjs 改成能同时挂多个），这条得从头到尾走一遍。
 *
 * 用法: node tools\测一轮多写.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.resolve(项目根, '..')
const 确认 = require(path.join(项目根, '脑', '确认.cjs'))
const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))

const 测试目录 = path.join(工作区根, '_多写测试')

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   一轮里写两个文件')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  fs.rmSync(测试目录, { recursive: true, force: true })
  fs.mkdirSync(测试目录, { recursive: true })

  // 记录每一次"要他点头"，并且**全部同意**
  const 卡片们 = []
  确认.注册({
    问窗口: async (请求) => {
      卡片们.push(请求)
      console.log(`  〔卡片〕${请求.类型}：${请求.路径 || 请求.命令}`)
      // 故意延迟一下，让多个请求能同时挂上 —— 这才是原来出事的场景
      await new Promise((停) => setTimeout(停, 200))
      确认.结算(请求.编号, true)
      return undefined // 表示"我这边异步答，别当成已结算"
    },
  })

  const 结果 = await 说话({
    他说的话: `请在 ${测试目录} 里写两个文件：一个是 a.txt，内容是"第一个文件"；另一个是 b.txt，内容是"第二个文件"。`,
    模式: 'work',
    工作区: 测试目录,
    问: (请求) => 确认.问(请求),
  })

  console.log('')
  console.log('  ── 结果 ──')
  console.log(`  弹了 ${卡片们.length} 张卡片`)
  console.log(`  她动了 ${结果.用过的工具.length} 次手：`)
  for (const t of 结果.用过的工具) {
    console.log(`    ${t.名字}(${t.参数}) → ${t.结果 && t.结果.好 ? '✓' : '✗ ' + ((t.结果 && t.结果.说明) || '？')}`)
  }

  console.log('')
  console.log('  ── 磁盘上真的有什么 ──')
  const 文件们 = fs.existsSync(测试目录) ? fs.readdirSync(测试目录) : []
  for (const 名 of 文件们) {
    const 全 = path.join(测试目录, 名)
    console.log(`    ${名}（${fs.statSync(全).size} 字节）: ${JSON.stringify(fs.readFileSync(全, 'utf8').slice(0, 60))}`)
  }

  console.log('')
  console.log('  ── 她最后说的 ──')
  console.log(结果.她说的话.split('\n').map((l) => '  ' + l).join('\n'))

  // 判定
  const 有误拒 = 结果.用过的工具.some((t) => t.结果 && !t.结果.好 && String(t.结果.说明 || '').includes('不同意'))
  console.log('')
  if (有误拒) {
    console.log('  ✗ 还有"他不同意"的误判 —— 没修干净')
  } else if (文件们.length) {
    console.log(`  ✓ 没有误判，而且真写出了 ${文件们.length} 个文件`)
  } else {
    console.log('  ~ 没有误判，但她这次没写文件（看她说了什么）')
  }
  console.log('')

  fs.rmSync(测试目录, { recursive: true, force: true })
}

main().catch((错误) => {
  console.log('✗ ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  fs.rmSync(测试目录, { recursive: true, force: true })
  process.exit(1)
})
