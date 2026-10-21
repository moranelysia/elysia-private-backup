/**
 * 测附件.cjs —— 他发过来的图片和文件，走得通吗
 *
 * 【为什么这些格子要紧】
 *   附件这条路上有几个"安静地做错"的地方，不注意根本看不出来：
 *     · 文件名没洗 → 传个 ..\..\ 的名字就能把文件写到附件目录外面去
 *     · 名字没加时间戳 → 他连发两张"截图.png"，第二张盖掉第一张，
 *       而聊天记录里两条都指着同一个文件（第一张永远没了，不报错）
 *     · 图没进请求 → 她只看到"他发了个文件"，然后干说一句"我看不到"
 *
 * 【"图有没有真的进请求"是怎么验的】
 *   把 fetch 换成假的，直接看**发出去的请求体**里
 *   content 是一句话（字符串）还是一串块（数组）。
 *   这样不用花钱，也不用猜。
 *
 * 【为什么不碰真的 记忆\附件\】
 *   用 ELYSIA_附件目录 指到一个测试目录，跑完整个删掉。
 *
 * 用法: node tools\测附件.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 脑 = path.join(项目根, '脑')
const 测试目录 = path.join(项目根, '.cache', '_测附件')

// 【必须在 require 附件.cjs 之前设】不然测试会往真的 记忆\附件\ 里丢假文件
process.env.ELYSIA_附件目录 = 测试目录

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

/** 一张 1×1 的透明 PNG（最短的那种），拿来当"他发的图" */
const 小PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ---------------------------------------------------------------
//  假网：只为看发出去的请求体里 content 长什么样
// ---------------------------------------------------------------
const 编码器 = new TextEncoder()
function 编码(文字) {
  return 编码器.encode(文字)
}

function 装假网(抓到) {
  const 真网 = globalThis.fetch
  globalThis.fetch = async (_地址, 选项) => {
    try {
      抓到.push(JSON.parse(选项.body))
    } catch {
      抓到.push(null)
    }
    const 段 = [
      编码('data: ' + JSON.stringify({ choices: [{ delta: { content: '我看到啦' } }] }) + '\n\n'),
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

/** 请求体里最后那条消息（就是"他刚说的那句"） */
function 最后一条(体) {
  const 们 = (体 && 体.messages) || []
  return 们[们.length - 1] || {}
}

async function 主() {
  // 【先给真的 记忆\附件\ 拍个照】
  //   万一 ELYSIA_附件目录 没生效（比如哪天 require 顺序被人调了），
  //   测试就会往**真的**附件目录里丢一堆假文件，而且它自己一声不吭。
  //   结尾拿这张快照比对 —— 那才是"没碰真目录"的真凭据。
  //   （原来那格写的是 `!fs.existsSync(...) || true`，恒真，等于没查。）
  const 真附件目录 = path.join(项目根, '记忆', '附件')
  const 真目录原来的 = fs.existsSync(真附件目录) ? fs.readdirSync(真附件目录).sort() : null

  fs.rmSync(测试目录, { recursive: true, force: true })
  fs.mkdirSync(测试目录, { recursive: true })

  console.log('')
  console.log('  ════════════════════════════════════════════')
  console.log('   附件 —— 存得住吗、名字安全吗、图真进去了吗')
  console.log('  ════════════════════════════════════════════')
  console.log('')

  const 附件 = require(path.join(脑, '附件.cjs'))
  const 对话 = require(path.join(脑, '对话.cjs'))

  // -------------------------------------------------------------
  console.log('  ── 一、存下来 ──')

  const 甲 = 附件.存({ 名字: '笔记.txt', 类型: 'text/plain', 字节: Buffer.from('你好呀') })
  检查('存下来了', 甲.好, 甲.说明)
  检查('  文件真的在盘上', 甲.好 && fs.existsSync(甲.路径))
  检查('  落在附件目录里', 甲.好 && 甲.路径.startsWith(附件.存放目录))
  检查('  名字前面加了时间戳（防重名）', /^\d{8}-\d{6}-笔记\.txt$/.test(甲.存成), 甲.存成)
  检查('  读得回来，内容没变', fs.readFileSync(甲.路径, 'utf8') === '你好呀')

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 二、★ 同一个名字连发两张，不许互相盖 ──')

  const 乙 = 附件.存({ 名字: '截图.png', 类型: 'image/png', 字节: 小PNG })
  const 丙 = 附件.存({ 名字: '截图.png', 类型: 'image/png', 字节: 小PNG })
  检查('两张都存下来了', 乙.好 && 丙.好, [乙.说明, 丙.说明].join('；'))
  检查('  ★ 名字不一样（第二张没盖掉第一张）', 乙.存成 !== 丙.存成, 乙.存成 + ' vs ' + 丙.存成)
  检查('  第一张还在盘上', fs.existsSync(乙.路径))
  检查('  第二张也在', fs.existsSync(丙.路径))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 三、★ 名字里的坏东西要洗掉 ──')

  检查('路径穿越被切断', 附件.洗名字('..\\..\\windows\\evil.txt') === 'evil.txt', 附件.洗名字('..\\..\\windows\\evil.txt'))
  检查('正斜杠也一样', 附件.洗名字('../../evil.txt') === 'evil.txt', 附件.洗名字('../../evil.txt'))
  检查(
    'Windows 不认的字符被换掉',
    !/[<>:"|?*]/.test(附件.洗名字('a<b>c:d"e|f?g*h.txt')),
    附件.洗名字('a<b>c:d"e|f?g*h.txt'),
  )
  检查('空名字也能兜住', 附件.洗名字('') === '文件', 附件.洗名字(''))

  const 坏 = 附件.存({ 名字: '..\\..\\想跑出去.txt', 类型: 'text/plain', 字节: Buffer.from('x') })
  检查('★ 存的时候也跑不出附件目录', 坏.好 && 坏.路径.startsWith(附件.存放目录), 坏.路径)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 四、空的、太大的，要拦下来 ──')

  检查('空文件不收', !附件.存({ 名字: '空.txt', 类型: '', 字节: Buffer.alloc(0) }).好)
  检查('没内容的也不收', !附件.存({ 名字: 'x.txt' }).好)
  检查(
    '太大的不收（' + 附件.单个别超过 / 1024 / 1024 + 'MB 以上）',
    !附件.存({ 名字: '大.bin', 类型: '', 字节: Buffer.alloc(附件.单个别超过 + 1) }).好,
  )

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 五、认不认得出是图片 ──')

  const 图 = 附件.存({ 名字: '照片.png', 类型: 'image/png', 字节: 小PNG })
  检查('后缀是 .png → 当图片', 图.是图片 === true)
  检查('  顺手给了 dataUrl（省得回头再读一遍盘）', /^data:image\/png;base64,/.test(图.dataUrl || ''))
  检查('  不是图片的就没有 dataUrl', !甲.dataUrl)
  检查('能看图吗：flash 能', 附件.能看图吗('deepseek-flash') === true)
  检查('能看图吗：chat 不能', 附件.能看图吗('deepseek-chat') === false)
  检查('能看图吗：没名字的时候说不能（保守）', 附件.能看图吗('') === false)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 六、给她的那段话 ──')

  const 话1 = 附件.拼给她([图], { 图放进去了: false })
  检查('写了文件在哪（她自己够得着）', 话1.includes(图.路径))
  检查('★ 说清楚了她这一轮看不见图', /看不了图/.test(话1))
  检查('  给了她出路（换一段 flash 的 / 自己跑脚本）', /flash/.test(话1))

  const 话2 = 附件.拼给她([图], { 图放进去了: true })
  检查('图已经放进去了就不说"看不了"', !/看不了图/.test(话2))
  检查('  并且明说她看得见', /看得见/.test(话2))

  const 话3 = 附件.拼给她([甲], { 图放进去了: false })
  检查('普通文件说"看不到内容，但路径在上面"', /看不到内容/.test(话3) && 话3.includes(甲.路径))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 七、给界面读缩略图 ──')

  const 预览 = 附件.读预览(图.存成)
  检查('读得出 dataUrl', 预览.好 && /^data:image\/png;base64,/.test(预览.dataUrl || ''), 预览.说明)
  检查('★ 想读目录外面的东西读不到', !附件.读预览('..\\..\\钥匙.cjs').好)

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 八、★ 图片有没有真的走进请求 ──')

  const 抓到1 = []
  const 收网1 = 装假网(抓到1)
  try {
    await 对话.说话({
      他说的话: '看看这个',
      历史: [],
      模式: 'chat',
      模型: 'deepseek-flash', // 能看图的脑子
      附件们: [图],
    })
  } finally {
    收网1()
  }
  const 尾1 = 最后一条(抓到1[0])
  检查('content 变成了一串块（不是一句话了）', Array.isArray(尾1.content), typeof 尾1.content)
  if (Array.isArray(尾1.content)) {
    检查('  里面有文字块', 尾1.content.some((x) => x.type === 'text' && /看看这个/.test(x.text)))
    检查('  ★ 里面有图片块', 尾1.content.some((x) => x.type === 'image_url'))
    const 图块 = 尾1.content.find((x) => x.type === 'image_url')
    检查('  图片是 data: 开头的（本地图得这么给）', !!(图块 && /^data:image\//.test(图块.image_url.url)))
  } else {
    检查('  里面有文字块', false, 'content 不是数组')
    检查('  ★ 里面有图片块', false, 'content 不是数组')
  }

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 九、★ 换成看不了图的脑子 —— 不许把图硬塞进去 ──')

  const 抓到2 = []
  const 收网2 = 装假网(抓到2)
  try {
    await 对话.说话({
      他说的话: '看看这个',
      历史: [],
      模式: 'chat',
      模型: 'deepseek-chat', // 看不了图的
      附件们: [图],
    })
  } finally {
    收网2()
  }
  const 尾2 = 最后一条(抓到2[0])
  检查('content 还是一句话（没硬塞图片块）', typeof 尾2.content === 'string', typeof 尾2.content)
  if (typeof 尾2.content === 'string') {
    检查('  把那句话带上了', 尾2.content.includes('看看这个'))
    检查('  ★ 把文件路径告诉了她', 尾2.content.includes(图.路径))
    检查('  ★ 并且说了她这一轮看不见图', /看不了图/.test(尾2.content))
  } else {
    检查('  把那句话带上了', false)
    检查('  ★ 把文件路径告诉了她', false)
  }

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 十、★ 导入课件：再往材料区放一份 ──')
  //
  // 【这条路的来龙去脉】
  //   他在学习模式下发一份课件，除了进 记忆\附件\（那是**对话的账**：
  //   聊天记录里写着"他发过这个文件"，文件就得一直在，不然翻记录点不开），
  //   还要在 学习\材料\ 里放一份 —— 那才是他自己会去翻的地方。
  //
  //   这里量的是"另存"这件事本身。
  //   "只有学习模式才另存"是 main.js 里的判断，那个得重启整个程序才能验
  //   （记在 测试清单.md 里，别以为这儿全过就万事大吉）。
  const 提示词 = require(path.join(脑, '提示词.cjs'))
  const 配置 = require(path.join(脑, '配置.cjs'))
  检查(
    '学习区根指的是真的学习区（main.js 就是拿它拼材料区的）',
    提示词.学习区根 === 配置.学习区根,
    提示词.学习区根,
  )

  const 材料区 = path.join(测试目录, '_材料')
  const 课件 = 附件.存({ 名字: '第一章.pdf', 类型: 'application/pdf', 字节: Buffer.from('假装是课件') })

  const 另1 = 附件.另存一份(课件, 材料区)
  检查('另存成功了', 另1.好, 另1.说明)
  检查('  真的落在材料区里', 另1.好 && 另1.路径.startsWith(材料区), 另1.路径)
  检查('  ★ 名字是原名，不带时间戳（他要能一眼找到）', path.basename(另1.路径) === '第一章.pdf', path.basename(另1.路径))
  检查('  内容跟原件一模一样', fs.readFileSync(另1.路径, 'utf8') === '假装是课件')
  检查('  ★ 材料区本来不存在，自己建出来了', fs.existsSync(材料区))

  const 课件2 = 附件.存({ 名字: '第一章.pdf', 类型: 'application/pdf', 字节: Buffer.from('第二份') })
  const 另2 = 附件.另存一份(课件2, 材料区)
  检查('★ 同名课件再导入：加序号，不覆盖', 另2.好 && path.basename(另2.路径) === '第一章 (2).pdf', path.basename(另2.路径 || ''))
  检查('  ★ 第一份还在，内容没被换掉', fs.readFileSync(另1.路径, 'utf8') === '假装是课件')

  检查('★ 记忆区那份也还在（是"多存一份"，不是"搬走"）', fs.existsSync(课件.路径))

  检查('没存成的附件不给另存', !附件.另存一份({ 好: false }, 材料区).好)
  检查('没说存到哪儿就不猜', !附件.另存一份(课件, '').好)

  // 她那边得知道材料区里也有一份，不然她会以为"材料区是空的"
  课件.学习路径 = 另1.路径
  const 话4 = 附件.拼给她([课件], { 图放进去了: false })
  检查('★ 告诉她材料区里也有一份', 话4.includes(另1.路径))
  const 话5 = 附件.拼给她([甲], { 图放进去了: false })
  检查('  没导入的附件就不提材料区（不编）', !话5.includes('材料区'))

  // -------------------------------------------------------------
  console.log('')
  console.log('  ── 十一、收尾 ──')

  fs.rmSync(测试目录, { recursive: true, force: true })
  检查('测试目录擦掉了（没往 记忆\\附件\\ 里丢垃圾）', !fs.existsSync(测试目录))

  // 【这条才是真的】开头拍了照，现在比对 —— 一个文件都不该多出来
  const 真目录现在 = fs.existsSync(真附件目录) ? fs.readdirSync(真附件目录).sort() : null
  检查(
    '★ 真的 记忆\\附件\\ 一个文件都没多',
    JSON.stringify(真目录现在) === JSON.stringify(真目录原来的),
    `原来 ${真目录原来的 ? 真目录原来的.length : '（没有这个目录）'} 个，现在 ${真目录现在 ? 真目录现在.length : '（没有这个目录）'} 个`,
  )

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
