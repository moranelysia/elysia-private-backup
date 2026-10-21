/**
 * 测两层温度.cjs —— 量"工作内容跟说话分开生成"有没有用
 *
 * 【moran 的想法】
 *   2026-10-01 深夜他提的：
 *     "把文字的回答温度调高，但是工作内容不需要用爱莉的语气 ——
 *      工作就是工作，把回答和工作内容分开算会不会好一点"
 *
 *   这个判断对。那天晚上的毛病（代码里空循环、混日语、说了没写）
 *   有一个共同点：**那几件事的性质不一样，而我一直用一个温度管着。**
 *   跟你贫嘴是"创作"（要散、要跳），写代码是"工程"（要准、要收敛）。
 *
 * 【这个脚本量什么】
 *   同一道题（写个 C 程序），两种做法各来一遍：
 *     A 层：让"她"用对话的温度顺手把代码写在回复里（原来的做法，0.8）
 *     B 层：单独跑一次低温，只写文件内容（新的做法，0.2 + gcc 自检）
 *   两份**都拿去编译**，看哪一份真的能跑。
 *
 *   光看代码"像不像样"不算数 —— 得编译器说了算。
 *
 * 【文件名为什么全用 ASCII】
 *   gcc 按系统编码看文件名，中文名会报 "No such file or directory"（实测过）。
 *   跟 .cmd 里不能有中文是同一类问题。
 *
 * 用法: node tools\测两层温度.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.resolve(项目根, '..')

const 生成内容 = require(path.join(项目根, '脑', '生成内容.cjs'))
const { 说话 } = require(path.join(项目根, '脑', '对话.cjs'))

const 题目 = '一个满屏星星往下飘的 C 程序。Windows 的 cmd 里跑，不要用 ANSI 转义序列'
const 测试目录 = path.join(工作区根, '_温度测试')

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

/** 环境验不了的时候，只报"验不了"，不算失败也不算通过 */
function 报编译结果(检, 标签) {
  if (检.验不了) {
    console.log(`  ⚠ ${标签}：${检.说明}`)
    return '验不了'
  }
  console.log(`  编译器说：${检.说明}`)
  检查(`${标签}：能编译`, 检.编得过, 检.说明)
  if (检.编得过) 检查(`${标签}：跑起来真画出东西`, !!检.画出了东西, 检.说明)
  return 检.编得过 ? '过了' : '没过'
}

/**
 * 编译 + 跑一下。
 *
 * 【为什么要跑】编得过不等于跑得对 —— 死循环里什么也不画也能编过。
 *   跑一秒（超时被杀是正常的，它是死循环），看有没有画出东西来。
 *
 * 【为什么要单独认 EPERM】
 *   在 DSH 的沙箱里，**Node 开不了 gcc**（报 spawnSync gcc EPERM），
 *   而 PowerShell 里直接跑 gcc 是好的。这是个环境限制，不是"编译失败"。
 *   第一版没认这个，把沙箱限制报成了 0/4 —— 误导人。
 *   所以这里分开报：验不了 / 编不过 / 编过了。
 */
function 试编译(源码路径, 名字) {
  const exe路径 = path.join(测试目录, 名字 + '.exe')
  try {
    execFileSync('gcc', [源码路径, '-o', exe路径, '-Wall'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      cwd: 测试目录,
    })
  } catch (错误) {
    if (错误.code === 'EPERM') {
      return {
        验不了: true,
        说明: '这个环境里 Node 开不了 gcc（EPERM）—— 在你自己的终端里跑这个脚本才能验',
      }
    }
    const 错 = ((错误.stderr || '') + (错误.stdout || '')).toString().trim()
    return { 编得过: false, 说明: 错.split('\n').slice(0, 4).join(' ⏎ ').slice(0, 300) || 错误.message }
  }

  let 画出了东西 = false
  try {
    const 输出 = execFileSync(exe路径, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 1500,
      cwd: 测试目录,
    }).toString()
    画出了东西 = 输出.replace(/\s/g, '').length > 20
  } catch (错误) {
    const 输出 = ((错误.stdout || '') + (错误.stderr || '')).toString()
    画出了东西 = 输出.replace(/\s/g, '').length > 20
  }
  return { 编得过: true, 画出了东西, 说明: 画出了东西 ? '编过，而且真的画出了东西' : '编过，但屏幕上没画出什么' }
}

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log('   工作内容跟说话分开生成 —— 到底有没有用')
  console.log(`   题目：${题目}`)
  console.log('  ════════════════════════════════════════════════════════')

  fs.rmSync(测试目录, { recursive: true, force: true })
  fs.mkdirSync(测试目录, { recursive: true })

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── A：让"她"用对话的温度顺手写（温度 0.8，原来的做法）──')

  let A内容 = null
  try {
    const r = await 说话({
      他说的话: `帮我写一个${题目}，就放在 ${测试目录} 里`,
      模式: 'work',
      工作区: 测试目录,
      问: async () => true,
    })
    const 写过的 = r.用过的工具.filter((t) => t.名字 === '写' && t.结果 && t.结果.好)
    for (const 一件 of 写过的) {
      const 写的路径 = String(一件.参数).replace(/[!！]$/, '').trim()
      const 全 = path.isAbsolute(写的路径) ? 写的路径 : path.join(测试目录, 写的路径)
      if (fs.existsSync(全) && 全.toLowerCase().endsWith('.c')) {
        A内容 = fs.readFileSync(全, 'utf8')
      }
    }
    console.log(`  她说：${r.她说的话.split('\n')[0].slice(0, 70)}`)
    console.log(`  动了 ${r.用过的工具.length} 次手`)
  } catch (错误) {
    console.log('  ✗ 出错：' + 错误.message)
  }

  if (!A内容) {
    console.log('  （她这次没写出 .c 文件来 —— 这本身也是一种结果）')
    检查('A：写出了文件', false, '没写出 .c 文件')
  } else {
    const A路径 = path.join(测试目录, 'a.c')
    fs.writeFileSync(A路径, A内容, 'utf8')
    console.log(`  写出来 ${A内容.split('\n').length} 行、${A内容.length} 字`)
    报编译结果(试编译(A路径, 'a'), 'A')
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── B：单独跑一次低温（温度 0.2 + gcc 自检，新的做法）──')

  const B结果 = await 生成内容.写({
    要写什么: 题目,
    路径: 'starfall.c',
    要求: '每一行都要有用，不许留空循环或占位符',
  })

  if (!B结果.好) {
    console.log('  ✗ ' + B结果.说明)
    检查('B：生成成功', false, B结果.说明)
  } else {
    const B路径 = path.join(测试目录, 'b.c')
    fs.writeFileSync(B路径, B结果.内容, 'utf8')
    console.log(`  写出来 ${B结果.内容.split('\n').length} 行、${B结果.内容.length} 字，用时 ${B结果.用时.toFixed(1)}s`)
    console.log(`  她自己那关：${B结果.说明}`)
    报编译结果(试编译(B路径, 'b'), 'B')
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ════════════════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}`)
  console.log('  ════════════════════════════════════════════════════════')
  console.log('')
  console.log(`  两份文件留在：${测试目录}`)
  console.log('  （a.c 是她顺手写的，b.c 是低温单独写的 —— 想自己编就 gcc 一下）')
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
