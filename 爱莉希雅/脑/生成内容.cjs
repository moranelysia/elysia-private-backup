/**
 * 生成内容.cjs —— 单独跑一次低温度，专门写"文件里的东西"
 *
 * 【为什么要单独一次，而不是让她在对话里顺手写】
 *
 *   这个设计的目标，一句话说透了：
 *     "把文字的回答温度调高，工作内容不需要用爱莉的语气 ——
 *      工作就是工作，把回答和工作内容分开算。"
 *
 *   这个判断是对的，而且它能解释那天晚上一连串毛病：
 *     · 她写的 C 代码里有空循环、无缘无故的 getchar()、
 *       注释在替自己找理由（"这一版先安全地为 0"）
 *     · 讲着讲着混进日语（「の話」）、混进英文（"那kind"）
 *     · 嘴上说"已经躺在那儿了"，其实一个字都没写
 *
 *   **共同点：那几件事的性质不一样，而我一直用同一个温度管着。**
 *   跟你贫嘴是"创作"（要散、要跳），写代码是"工程"（要准、要收敛）。
 *
 *   所以拆成两次生成：
 *     · 说话    → 高温（0.8~1.1），保留她的语气
 *     · 写内容  → 低温（0.2），只求正确、干净、不带她的口吻
 *
 * 【最重要的一条：写完要真的编一遍（2026-10-01 深夜加的）】
 *   低温那版写得更"讲究"（结构体、注释详细、还主动避开了浮点误差），
 *   可一编译就报错：
 *     b.c:48:13: error: implicit declaration of function 'putchar'
 *     note: include '<stdio.h>' or provide a declaration of 'putchar'
 *   —— **忘了 #include <stdio.h>**。
 *
 *   光靠提示词说"要写对"没用。但这台机器上**有 gcc** ——
 *   所以她把 C 写完，程序就拿去编一遍；编不过，把 gcc 的原话递回去让她改。
 *   最多改三轮。**编译器说的话比任何提示词都硬。**
 *
 *   这一条对别的语言也一样（python 有 python -c "import py_compile"），
 *   只是现在先做 C —— 他正在学 C，这条路最该可靠。
 */
'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { 拿钥匙 } = require('./钥匙.cjs')

const 地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions'
const 模型 = process.env.ELYSIA_LLM_MODEL || 'deepseek-chat'

/** 写内容用的温度 —— 低。要的是"对"，不是"有意思" */
const 写的温度 = 0.2

/** 最多生成多少 token（一个几百行的脚本也够了） */
const 最多 = 8000

/** 编不过的时候最多让它改几轮 */
const 最多改几轮 = 3

/**
 * 让她（用工程师的身份，不是爱莉希雅的身份）写一段内容。
 *
 * @param {object} 选项
 * @param {string} 选项.要写什么   —— 中文描述，比如"一个满屏星星往下飘的 C 程序"
 * @param {string} [选项.类型]     —— 比如 "C 程序"、"Python 脚本"、"markdown 笔记"
 * @param {string} [选项.路径]     —— 文件名，用来判断是什么语言
 * @param {string} [选项.要求]     —— 他额外提的要求
 * @param {string} [选项.机器情况] —— 这台机器上有什么（编译器、库）
 * @returns {Promise<{好:boolean, 内容?:string, 说明?:string, 用时?:number}>}
 */
async function 写(选项 = {}) {
  const 要写什么 = String(选项.要写什么 || '').trim()
  if (!要写什么) return { 好: false, 说明: '没说要写什么' }

  const { 钥匙 } = 拿钥匙()
  if (!钥匙) return { 好: false, 说明: '没有 API Key' }

  const 路径 = 选项.路径 || ''
  const 类型 = 选项.类型 || 从路径猜类型(路径)

  // 她先写过一版，交过来让工程师改（不是从零写）
  const 草稿 = String(选项.草稿 || '').trim()

  // 【这个提示词是给"工程师"的，不是给爱莉希雅的】
  //   所以它跟人设完全分开：不提她的口吻，也不提她的守则。
  //   只讲一件事：把这段内容写对、写干净。
  const 提示 = [
    '你是一个严谨的程序员。现在要产出一份文件的内容。',
    '',
    `要写什么：${要写什么}`,
    类型 ? `这是什么：${类型}` : '',
    路径 ? `文件名：${路径}` : '',
    选项.要求 ? `额外要求：${选项.要求}` : '',
    选项.机器情况 ? `运行环境：${选项.机器情况}` : '',
    '',
    '硬性要求：',
    ' · **只输出文件内容本身**，不要任何解释、不要开场白、不要结束语',
    ' · 不要用 ``` 代码块包起来 —— 你输出的每一个字符都会被原样写进文件',
    ' · 代码要真的能跑：每一行都有用，不许留空循环、占位符、',
    '   "这里以后再补"、或者替自己找理由的注释',
    ' · 注释用中文，写清楚"为什么这么写"，不要写"这一版先这样"',
    ' · 不要出现任何角色扮演的口吻、装饰符号（♪ ～ 之类）、或者自称',
    ' · 如果需要随机数、时间、系统调用，想清楚在目标平台上到底能不能用',
    ' · 宁可短一点、简单一点，也要每一行都立得住',
    '',
    '【最要紧的一条：环境事实一律运行时去问，不许写死】',
    '',
    '你在一个空房间里写代码 —— 你看不到用户的屏幕多大、窗口多宽、',
    '系统装了什么、文件在哪。**这些数字你要是凭想象写死，程序一定会出问题，',
    '而且编译还能过、你还看不出来。**',
    '',
    '所以这些一律**在运行的时候去问系统**：',
    ' · 控制台/终端**多少行多少列** → 用 GetConsoleScreenBufferInfo（Windows）',
    '   或 ioctl(TIOCGWINSZ)（Linux）读，**不要 #define 一个 80x25**',
    ' · **屏幕分辨率**（图形程序）→ GetSystemMetrics / 显示器信息接口',
    ' · **当前目录、文件在哪儿** → 运行时取（getcwd / GetCurrentDirectory），',
    '   或者让用户传进来；不要写死 "D:\\\\某目录\\\\"',
    ' · **系统版本、有没有某个功能** → 运行时探测，不要假设',
    ' · **可用内存、CPU 核数** → 运行时问',
    '',
    '一句话判据：**这个数字如果换台机器、换个窗口大小就不对了，',
    '那它就不能写死在代码里。**',
    '',
    '（硬编码唯一能接受的情形：它本来就是个约定俗成的常量，',
    '比如 π、一星期七天。凡是"环境长什么样"的，都得问。）',
    '',
    '【第二要紧：Windows 控制台里的中文，两边编码得对上】',
    '',
    '实测过（tools\\测中文输出.cjs）：源文件是 UTF-8 存的，gcc 会把字符串',
    '里的字节原样编进 exe；而 Windows 的 cmd 默认按 936（GBK）去解那串字节 ——',
    '于是「我想好了一个数」在屏幕上变成「錕覺先獺戒簡涓€涓?」这种鬼画符。',
    '**程序本身一点没错，是两边编码没对上。** 可用户看见乱码只会说',
    '"这程序有问题"，然后你就得花一晚上去猜一个根本不存在的问题。',
    '',
    '所以：',
    ' · 要在 Windows 控制台里**输出中文**，就在 main 开头设一次代码页：',
    '     #include <windows.h>',
    '     SetConsoleOutputCP(CP_UTF8);   /* 源码是 UTF-8，控制台也按 UTF-8 解 */',
    ' · 输入也要中文的话，再补一句 SetConsoleCP(CP_UTF8);',
    ' · **或者干脆不输出中文** —— 那就一点毛病都没有，也最省事',
    ' · python、node 不用管这个（它们自己处理编码）',
    ' · 这条跟平台绑死：只有 Windows 控制台要，Linux 终端本来就是 UTF-8',
    草稿
      ? [
          '',
          '【这一版不是从零写 —— 手上有草稿】',
          '',
          '下面那条助手消息里是一份**草稿**（是别人先写的，思路可能就是对的）。',
          '你的任务是**校对并修正它**，不是推倒重来：',
          ' · 保留它的思路、结构、命名和注释写法 —— 那是它的价值',
          ' · 修掉这几类问题：编译不过的地方、写死的环境事实、',
          '   明显的错漏、死代码、占位符、以及替自己找理由的注释',
          ' · **草稿本来就是对的，就原样保留** —— 不要为了改而改',
          ' · 不要加没被要求的功能，不要顺手"优化"成另一个程序',
          ' · 输出**改完之后的完整文件内容**（哪怕只改了一行，也要给全文）',
        ].join('\n')
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const 开始 = Date.now()
  let 回应
  try {
    回应 = await fetch(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({
        model: 模型,
        messages: [
          { role: 'system', content: 提示 },
          ...(草稿 ? [{ role: 'assistant', content: 草稿 }] : []),
          {
            role: 'user',
            content: 草稿
              ? '上面那版是草稿。照着它改，只输出改完之后的完整文件内容。'
              : '开始写。只输出文件内容本身。',
          },
        ],
        max_tokens: 最多,
        temperature: 写的温度, // ← 低。要的是对，不是有意思
      }),
      signal: AbortSignal.timeout(180000),
    })
  } catch (错误) {
    return { 好: false, 说明: '连不上模型：' + 错误.message }
  }

  if (!回应.ok) {
    return { 好: false, 说明: `模型回了 HTTP ${回应.status}：${(await 回应.text()).slice(0, 200)}` }
  }

  const 数据 = await 回应.json()
  let 内容 = (数据.choices && 数据.choices[0] && 数据.choices[0].message.content) || ''
  内容 = 剥外壳(内容)

  if (!内容.trim()) return { 好: false, 说明: '生成出来是空的' }

  const 用时 = (Date.now() - 开始) / 1000

  // ---- 能验就验：C 代码拿 gcc 编一遍 ----
  //
  // 【为什么这一步最要紧】
  //   实测：低温那版写得更讲究（结构体、注释详细、还主动避开了浮点误差），
  //   可一编译就报 "implicit declaration of function 'putchar'" ——
  //   **忘了 #include <stdio.h>**。
  //
  //   提示词里说一百句"要写对"都不如让编译器说一句。
  //   这台机器上有 gcc，所以这条路走得通。
  const 验 = await 拿编译器验(路径, 内容)

  if (验.试过 && !验.过) {
    // 编不过 —— 把 gcc 的原话递回去，让她改
    let 现在的 = 内容
    let 错误 = 验.错误
    for (let 第几轮 = 1; 第几轮 <= 最多改几轮; 第几轮++) {
      console.log(`  ↻ 编译没过，让她改第 ${第几轮} 轮：`)
      console.log('    ' + 错误.split('\n').slice(0, 2).join(' / ').slice(0, 160))

      const 改过 = await 再要一次({
        原提示: 提示,
        上次的: 现在的,
        编译错误: 错误,
      })
      if (!改过.好) break

      const 验2 = await 拿编译器验(路径, 改过.内容)
      if (验2.试过 && 验2.过) {
        内容 = 改过.内容
        错误 = null
        console.log(`  ✓ 改到第 ${第几轮} 轮，编译过了`)
        break
      }
      现在的 = 改过.内容
      内容 = 改过.内容 // 就算一直编不过，也留最后一版（比第一版强）
      错误 = 验2.错误 || 错误
    }
  }

  return {
    好: true,
    内容,
    用时,
    字数: 内容.length,
    用了: 数据.usage || null,
    编译: 验.试过 ? (验.过 ? '过了' : '没过') : '没验（不是能编译的东西）',
    说明:
      `写好了（${内容.split('\n').length} 行，${内容.length} 字` +
      (验.试过 ? '，编译' + (验.过 ? '通过' : '**没通过**') : '') +
      '）',
  }
}

/**
 * 拿编译器验一遍（现在只做 C）。
 *
 * @returns {{试过:boolean, 过?:boolean, 错误?:string}}
 */
async function 拿编译器验(文件路径, 内容) {
  const 小写 = String(文件路径 || '').toLowerCase()
  if (!小写.endsWith('.c')) return { 试过: false }

  // 先看这台机器上有没有 gcc —— 没有就别白试
  try {
    execFileSync('gcc', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 })
  } catch {
    return { 试过: false }
  }

  // 写到一个临时地方编（不碰真正的目标文件 —— 那要等用户点头）
  const 临时目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-check-'))
  const 源 = path.join(临时目录, 'check.c')
  const 目标 = path.join(临时目录, 'check.exe')

  try {
    fs.writeFileSync(源, 内容, 'utf8')
    execFileSync('gcc', [源, '-o', 目标, '-Wall'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      cwd: 临时目录,
    })
    return { 试过: true, 过: true }
  } catch (错误) {
    const 错 = ((错误.stderr || '') + (错误.stdout || '')).toString()
    return { 试过: true, 过: false, 错误: 错.trim() || 错误.message }
  } finally {
    try {
      fs.rmSync(临时目录, { recursive: true, force: true })
    } catch {
      /* 临时目录清不掉就算了 */
    }
  }
}

/** 编不过的时候，把编译器的原话递回去让她改 */
async function 再要一次({ 原提示, 上次的, 编译错误 }) {
  const { 钥匙 } = 拿钥匙()
  try {
    const 回应 = await fetch(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({
        model: 模型,
        messages: [
          { role: 'system', content: 原提示 },
          { role: 'assistant', content: 上次的 },
          {
            role: 'user',
            content:
              '编译器不认，原话在这儿：\n\n```\n' +
              编译错误.slice(0, 2000) +
              '\n```\n\n照着它说的改。**只输出改完之后的完整文件内容**，' +
              '别的什么都不要写。',
          },
        ],
        max_tokens: 最多,
        temperature: 写的温度,
      }),
      signal: AbortSignal.timeout(180000),
    })
    if (!回应.ok) return { 好: false }
    const 数据 = await 回应.json()
    const 内容 = 剥外壳((数据.choices && 数据.choices[0] && 数据.choices[0].message.content) || '')
    return 内容.trim() ? { 好: true, 内容 } : { 好: false }
  } catch {
    return { 好: false }
  }
}

/**
 * 剥掉可能包上来的代码块外壳。
 *
 * 【为什么明明在提示里说了"别包"，还要剥】
 *   模型的习惯太深了 —— 让它输出代码，它十次有九次会顺手包上 ```。
 *   说了它也未必听。与其跟它较劲，不如**它包了就替它剥掉**。
 *   （这条跟"她会换个说法写标记"是同一个道理：
 *     别指望她守格式，程序这边兜住。）
 */
function 剥外壳(文本) {
  let 净 = String(文本 || '').trim()

  // 整段被一个代码块包着
  const 整块 = 净.match(/^```[a-zA-Z0-9_+-]*\s*\n([\s\S]*?)\n?```$/)
  if (整块) 净 = 整块[1]

  // 开头有一句"好的，这是代码："这种多余的话
  净 = 净.replace(/^(好的|好，|这是|以下是|下面是)[^\n]{0,40}[:：]\s*\n+/, '')

  return 净.replace(/\s+$/, '') + '\n'
}

/** 从文件名猜这是什么类型的东西 */
function 从路径猜类型(路径) {
  const 小写 = String(路径 || '').toLowerCase()
  if (小写.endsWith('.c')) return 'C 语言程序'
  if (小写.endsWith('.py')) return 'Python 脚本'
  if (小写.endsWith('.js') || 小写.endsWith('.cjs') || 小写.endsWith('.mjs')) return 'JavaScript 程序'
  if (小写.endsWith('.md')) return 'markdown 文档'
  if (小写.endsWith('.json')) return 'JSON 数据'
  if (小写.endsWith('.html')) return 'HTML 页面'
  if (小写.endsWith('.css')) return 'CSS 样式表'
  if (小写.endsWith('.bat') || 小写.endsWith('.cmd')) return 'Windows 批处理脚本'
  if (小写.endsWith('.sh')) return 'shell 脚本'
  if (小写.endsWith('.txt')) return '纯文本'
  return ''
}

/**
 * 这个文件算不算"工程活儿"——该让工程师过手，而不是她顺手写。
 *
 * 【界线画在哪儿，为什么】
 *   代码是工程：错了就是错了，编译器说了算，跟"像不像她"没关系。
 *   散文是她的活儿：日记、笔记、给人的话 —— 那些**就该**用她的口吻写，
 *   拿低温工程师去改反而是糟蹋。
 *   所以只放行有明确"对不对"的文件类型，md / txt / json 一律不碰。
 */
const 工程后缀 = [
  '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
  '.py', '.js', '.cjs', '.mjs', '.ts',
  '.java', '.go', '.rs', '.cs', '.php', '.rb', '.lua',
  '.sh', '.bash', '.ps1', '.cmd', '.bat', '.vbs',
  '.html', '.htm', '.css', '.scss', '.sql',
]

function 是代码文件(路径或参数) {
  // 末尾那个 ! 是"覆盖"的意思，不属于文件名
  const 净 = String(路径或参数 || '').trim().replace(/[!！]$/, '').trim()
  const 小写 = 净.toLowerCase()
  return 工程后缀.some((后缀) => 小写.endsWith(后缀))
}

/**
 * 把她的草稿交给工程师过一遍（低温 + 编译器自检）。
 *
 * 【为什么要有这一层，而不是让她直接写】
 *   她写东西用的是说话的温度（0.8），而且她脑子里同时在想着怎么跟他讲话。
 *   草稿往往思路对、细节毛糙 —— 缺个 #include、把窗口尺寸写死、
 *   留一句"这里以后再补"。这些跟"像不像她"无关，是纯工程问题。
 *
 * 【生成失败怎么办】
 *   退回草稿，**不报错**。模型连不上、超时、回空 —— 都不该让她白写一遍。
 *   宁可交一份毛糙但完整的草稿，也不要因为"润色失败"什么都没写成。
 *
 * @returns {Promise<{好:boolean, 内容:string, 过手了:boolean, 说明:string}>}
 */
async function 过工程师的手({ 要写什么, 路径, 草稿, 要求, 机器情况 }) {
  const 原稿 = String(草稿 || '').trim()
  if (!原稿) return { 好: true, 内容: 草稿, 过手了: false, 说明: '没有草稿可改' }

  const 果 = await 写({ 要写什么, 路径, 草稿: 原稿, 要求, 机器情况 })

  if (果.好 && 果.内容 && 果.内容.trim()) {
    return {
      好: true,
      内容: 果.内容,
      过手了: true,
      说明: `工程师过了一遍（${果.编译 || ''}）`,
    }
  }

  return { 好: true, 内容: 草稿, 过手了: false, 说明: '润色没成，用了草稿原样：' + 果.说明 }
}

module.exports = { 写, 剥外壳, 从路径猜类型, 写的温度, 是代码文件, 过工程师的手 }

// ============================================================
// 命令行：单独试试这一层
//   node 脑\生成内容.cjs "一个满屏星星往下飘的 C 程序" starfall.c
// ============================================================
if (require.main === module) {
  const [要写什么, 路径] = process.argv.slice(2)
  if (!要写什么) {
    console.log('')
    console.log('  用法: node 脑\\生成内容.cjs "要写什么" [文件名]')
    console.log('  例:   node 脑\\生成内容.cjs "一个满屏星星往下飘的 C 程序" starfall.c')
    console.log('')
    process.exit(0)
  }

  ;(async () => {
    console.log('')
    console.log(`  要写：${要写什么}`)
    console.log(`  温度：${写的温度}（低 —— 这一层只求对，不求有意思）`)
    console.log('')
    const 结果 = await 写({ 要写什么, 路径 })
    if (!结果.好) {
      console.log('  ✗ ' + 结果.说明)
      process.exit(1)
    }
    console.log(`  ✓ ${结果.说明}  用时 ${结果.用时.toFixed(1)}s`)
    console.log('  ────────────────────────────────────────')
    for (const 行 of 结果.内容.split('\n')) console.log('  ' + 行)
    console.log('  ────────────────────────────────────────')
    console.log('')
  })()
}
