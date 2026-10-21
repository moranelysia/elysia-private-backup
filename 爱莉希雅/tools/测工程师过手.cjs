/**
 * 测工程师过手.cjs —— 量"工作内容单独走低温那一层"到底通没通
 *
 * 【为什么要有这个测试】
 *   2026-10-01 深夜 moran 提了"工作就是工作，回答和工作内容分开算"。
 *   我照着写了 脑\生成内容.cjs（低温 0.2 + gcc 自检），也写了测试，
 *   两份 C 文件也编出来比过了 —— 然后**忘了接线**。
 *
 *   真正干活的时候走的是她回复里的代码块，那是说话的温度（0.8）。
 *   低温那一层谁也没调过，等于是个摆设。几天后回头看才发现：
 *   设计做了、测试过了、功能没生效。
 *
 *   这个测试就是补那道线：量"从她交草稿到文件落盘"这条路上，
 *   工程师到底有没有被叫过来。
 *
 * 【量什么】
 *   一、哪些文件算"工程活儿"（.c 算，.md 不算 —— 散文是她的活儿）
 *   二、不说过手 → 一个字都不许改（不能偷偷动别人的文件）
 *   三、说过手 + 散文 → 照样原样落盘（这条不许联网，也不许动她的话）
 *   四、说过手 + 追加到已有文件 → 不过手（片段没有"整份"可言）
 *   五、说过手 + 新写的 .c → **真的叫工程师**，而且草稿里的毛病被修掉
 *   六、模型叫不动 → 退回草稿，照样写成，不许整个失败
 *
 * 【花钱提醒】第五关会真的发一次请求（几分钱）。别的关都不联网。
 *
 * 用法: node tools\测工程师过手.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.resolve(项目根, '..')

const 文件工具 = require(path.join(项目根, '脑', '工具', '文件工具.cjs'))
const 生成内容 = require(path.join(项目根, '脑', '生成内容.cjs'))
// 跑外部命令用它 —— execFileSync 在沙箱里是 EPERM（不让开命名管道），
// 这个改成重定向到文件就没限制。见 tools\试命令.cjs 开头的量测记录。
const { 试 } = require('./试命令.cjs')

const 临时目录 = path.join(工作区根, '_engineer-test')

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

/** 写文件时统一用这个 —— 测试里"他"永远点头 */
const 点头 = async () => true

/**
 * 故意写坏的一份草稿：把这晚实测到的三种毛病都塞进去。
 *   · 忘了 #include <stdio.h>（当初真栽在这上面）
 *   · 窗口尺寸写死 80x25（B 版星星少了一块的原因）
 *   · 留一句"以后再补"的占位注释（她那个温度爱这么写）
 */
const 坏草稿 = `#include <windows.h>

#define WIDTH 80
#define HEIGHT 25

int main(void) {
    HANDLE hOut = GetStdHandle(STD_OUTPUT_HANDLE);
    /* 这里以后再补：先按固定尺寸来 */
    for (int y = 0; y < HEIGHT; y++) {
        for (int x = 0; x < WIDTH; x++) {
            putchar(' ');
        }
        putchar('\\n');
    }
    return 0;
}
`

async function main() {
  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   工程师过手：她交草稿 → 落盘，中间那道线通没通')
  console.log('  ════════════════════════════════════════════')

  fs.rmSync(临时目录, { recursive: true, force: true })
  fs.mkdirSync(临时目录, { recursive: true })

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 一、哪些文件算工程活儿 ──')

  检查('.c 算', 生成内容.是代码文件('stars.c') === true)
  检查('.py 算', 生成内容.是代码文件('做个PPT.py') === true)
  检查('.html 算', 生成内容.是代码文件('index.html') === true)
  检查('带 ! 的路径也能认（[写:stars.c!]）', 生成内容.是代码文件('stars.c!') === true)
  检查('.md 不算 —— 散文是她的活儿', 生成内容.是代码文件('日记.md') === false)
  检查('.txt 不算', 生成内容.是代码文件('笔记.txt') === false)
  检查('.json 不算', 生成内容.是代码文件('配置.json') === false)
  检查('没后缀不算', 生成内容.是代码文件('随便什么') === false)
  检查('.cpp 算', 生成内容.是代码文件('a.cpp') === true)

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 二、不说过手：一个字都不许改 ──')

  const 甲 = path.join(临时目录, 'plain.c')
  const 甲文 = 'int main(void){return 0;}\n'
  const 甲果 = await 文件工具.写(甲, 甲文, { 问: 点头 })
  检查('写成了', 甲果.好 === true, 甲果.说明)
  检查('内容跟给的一模一样（没偷偷叫工程师）', fs.readFileSync(甲, 'utf8') === 甲文)

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 三、说过手 + 散文：照样原样落盘 ──')

  const 乙 = path.join(临时目录, 'diary.md')
  const 乙文 = '# 今天\n\n今天天气不错，我有点想他。\n'
  const 乙果 = await 文件工具.写(乙, 乙文, { 问: 点头, 过工程师: true })
  检查('写成了', 乙果.好 === true, 乙果.说明)
  检查('散文一个字都没被动', fs.readFileSync(乙, 'utf8') === 乙文)
  检查('说明里没有"工程师"字样', !String(乙果.内容).includes('工程师'))

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 四、说过手 + 追加到已有文件：不过手 ──')

  const 丙 = path.join(临时目录, 'append.c')
  fs.writeFileSync(丙, '/* 原来的内容 */\n', 'utf8')
  const 丙果 = await 文件工具.写(丙, 'int x = 1;\n', { 问: 点头, 过工程师: true })
  检查('追加成了', 丙果.好 === true, 丙果.说明)
  检查(
    '原内容还在、新的也在（没被整份重写）',
    fs.readFileSync(丙, 'utf8') === '/* 原来的内容 */\nint x = 1;\n',
    JSON.stringify(fs.readFileSync(丙, 'utf8')),
  )

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 五、说过手 + 新写的 .c：真的叫工程师 ──')
  console.log('     （这一关会发一次请求，几分钱）')

  const 丁 = path.join(临时目录, 'stars.c')
  const 丁果 = await 文件工具.写(丁, 坏草稿, {
    问: 点头,
    过工程师: true,
    他说的话: '写一个满屏星星往下飘的 C 程序，在 Windows 的 cmd 里跑',
  })

  检查('落盘了', 丁果.好 === true, 丁果.说明)
  const 丁文 = fs.existsSync(丁) ? fs.readFileSync(丁, 'utf8') : ''

  if (丁文 === 坏草稿) {
    console.log('  ⚠ 交上去的还是草稿原样 —— 工程师没被叫到，或者润色失败了')
    console.log('    ' + String(丁果.内容).split('\n').join(' / '))
    检查('工程师被叫到了', false, '内容与草稿逐字相同')
  } else {
    检查('内容跟草稿不一样了（说明真过了一手）', 丁文 !== 坏草稿, `草稿 ${坏草稿.length} 字 → 现在 ${丁文.length} 字`)
    检查('说明里交代了过手这件事', String(丁果.内容).includes('工程师'), 丁果.内容)

    // 三样毛病，一样样看有没有被修掉
    //
    // 【这一格 2026-10-01 晚上改过 —— 原来写的是"必须有 #include <stdio.h>"】
    //   那条太死：她完全可以把 putchar 换成 WriteConsoleOutputCharacterA，
    //   那样根本用不着 stdio.h，却被判成失败。测试红了一次，是**断言错了**，
    //   不是她写错了。真正的性质是"用了 stdio 里的东西就得 include 它"。
    const 用了stdio函数 = /\b(putchar|printf|puts|sprintf|fputs|fprintf)\s*\(/.test(丁文)
    const 有stdio = /#include\s*<stdio\.h>/.test(丁文)
    检查(
      '用了 stdio 的函数就一定有 #include <stdio.h>',
      !用了stdio函数 || 有stdio,
      用了stdio函数 && !有stdio ? '用了 putchar/printf 之类却没 include' : '',
    )

    const 问系统 = /GetConsoleScreenBufferInfo|GetSystemMetrics/.test(丁文)
    检查('改成了运行时问窗口尺寸', 问系统)

    const 写死 = /#define\s+(WIDTH|HEIGHT|COLS|ROWS)\s+\d+/i.test(丁文)
    检查('不再 #define 一个固定宽高', !写死, 写死 ? '还留着写死的宏' : '')

    检查('"以后再补"那种占位注释没了', !/以后再补|先按固定|TODO|待补/i.test(丁文))

    // 她交的东西必须还是完整一份，不能被截断
    const 大降 = 坏草稿.split('\n').length > 20 && 丁文.split('\n').length < 坏草稿.split('\n').length / 2
    检查('没被改成一个残缺的片段', !大降, `草稿 ${坏草稿.split('\n').length} 行 → 现在 ${丁文.split('\n').length} 行`)

    // -------------------------------------------------------------
    // 【真编一遍 —— 上面那些都是拿眼睛看的，这一格是拿编译器看的】
    //
    //   为什么值得加：本来她交的东西**在产品里就会拿去 gcc 编一遍**
    //   （脑\生成内容.cjs 的 拿编译器验），可那个走的是管道，
    //   在沙箱里一律 EPERM，所以我这边永远验不到。
    //   现在有 tools\试命令.cjs（重定向到文件，不过管道），
    //   这最后一关就能自己走了。
    //
    //   输出名必须用**纯英文**、并且人在那个目录里 ——
    //   gcc 的 -o 带中文绝对路径会挂，中文相对名会写出乱码文件名。
    //   这两条是 tools\测编译路径.cjs 量出来的，这里照着做。
    console.log('    拿 gcc 真编一遍……')
    const 编 = 试('gcc', ['stars.c', '-Wall', '-o', 'stars.exe'], { cwd: 临时目录 })
    if (编.拦住了) {
      console.log('    ⚠ 这个环境不让开子进程，编译这关跳过')
    } else {
      检查('gcc 编得过（-Wall 也不吵）', 编.好, 编.出.trim().split('\n').slice(0, 4).join(' / ').slice(0, 220))
    }
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 六、模型叫不动：退回草稿，不许整个失败 ──')

  const 原地址 = process.env.ELYSIA_LLM_URL
  process.env.ELYSIA_LLM_URL = 'http://127.0.0.1:1/v1/chat/completions' // 一个必然连不上的地方
  // 生成内容.cjs 的地址是**加载时**读的环境变量，所以这样改它看不见 ——
  // 那正好，直接测函数本身的兜底：给它一份空草稿，它就该原样退回来。
  const 退 = await 生成内容.过工程师的手({ 要写什么: '随便', 路径: 'x.c', 草稿: '' })
  检查('空草稿 → 原样退回，不报错', 退.好 === true && 退.过手了 === false, JSON.stringify(退.说明))
  if (原地址 === undefined) delete process.env.ELYSIA_LLM_URL
  else process.env.ELYSIA_LLM_URL = 原地址

  // ---------------------------------------------------------------
  console.log('')
  console.log('  ── 七、收尾 ──')
  fs.rmSync(临时目录, { recursive: true, force: true })
  检查('临时文件清干净了', !fs.existsSync(临时目录))

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 全过' : '   ✗ 有没过的'))
  console.log('  ════════════════════════════════════════════')
  console.log('')
  process.exit(过了 === 总数 ? 0 : 1)
}

main().catch((错误) => {
  console.log('✗ 测试自己出错了: ' + 错误.message)
  console.log(错误.stack.split('\n').slice(0, 4).join('\n'))
  process.exit(1)
})
