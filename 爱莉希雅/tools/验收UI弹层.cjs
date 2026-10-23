/**
 * 阶段 3 的 Electron 视觉与交互验收夹具。
 * 固定生成文件、工作索引、工具记录、上下文、设置和表达反馈六种状态；
 * 只写 .cache，所有接口均由隔离 preload 接管，不读写真实聊天、设置或工作数据。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前')
  .replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用弹层玻璃 = process.env.ELYSIA_UI_DISABLE_OVERLAY_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-overlays-'))
const 输出目录 = path.join(项目根, '.cache')
const 场景们 = ['文件', '工作索引', '工具记录', '上下文', '设置', '表达反馈']

process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

async function 注入场景(窗口, 场景) {
  const 源码 = `(async () => {
    try {
    const 场景 = ${JSON.stringify(场景)}
    const 关闭 = ['文件抽屉', '工作索引抽屉', '工具记录遮罩', '上下文遮罩', '设置遮罩', '表达反馈遮罩']
    for (const 编号 of 关闭) {
      const 元素 = document.getElementById(编号)
      元素.classList.add('收着')
      if (元素.hasAttribute('aria-hidden')) 元素.setAttribute('aria-hidden', 'true')
    }

    document.getElementById('对话列表').innerHTML = [
      '<div class="对话行"><button class="对话 当前"><span class="对话标题">界面细节</span><span class="对话小字">刚刚 · 18 条 · flash</span></button></div>',
      '<div class="对话行"><button class="对话"><span class="对话标题">记忆系统优化</span><span class="对话小字">昨天 · 42 条 · flash</span></button></div>'
    ].join('')
    const 开场 = document.getElementById('开场')
    if (开场) 开场.style.display = 'none'
    document.getElementById('聊天区').insertAdjacentHTML('beforeend', '<div class="一条 她的 阶段3夹具"><div class="气泡">这次只整理抽屉和弹层，原来的位置与功能都不动♪</div><div class="时间">10:23</div></div>')

    document.getElementById('产物列表').innerHTML = [
      '<button class="产物项 选中"><span class="产物名字">界面验收说明.md</span><span class="产物目录">F:\\\\elysia\\\\爱莉希雅</span></button>',
      '<button class="产物项"><span class="产物名字">阶段三对照.png</span><span class="产物目录">.cache</span></button>'
    ].join('')
    document.getElementById('文件预览').innerHTML = '<pre class="文件正文"># 阶段三验收\\n\\n抽屉保持原来的宽度，正文仍然可以选择复制。\\n开合只使用透明度与轻微位移。</pre>'

    document.getElementById('工作索引统计').textContent = '找到 2 条'
    document.getElementById('工作索引列表').innerHTML = [
      '<article class="工作索引卡"><div class="工作索引卡头"><span class="工作索引状态">已完成</span><time class="工作索引时间">10:18</time></div><div class="工作索引目标">统一主界面玻璃层次</div><div class="工作索引结果">常驻区和聊天内容层已经完成自动验收。</div><div class="工作索引工具"><span>apply_patch</span><span>Electron</span></div></article>',
      '<article class="工作索引卡 部分完成"><div class="工作索引卡头"><span class="工作索引状态">部分完成</span><time class="工作索引时间">10:22</time></div><div class="工作索引目标">抽屉与弹层优化</div><div class="工作索引结果">等待人工确认开合手感与视觉层次。</div><button class="工作索引继续">继续这项工作</button></article>'
    ].join('')

    document.getElementById('工具记录列表').innerHTML = [
      '<article class="工具记录卡"><div class="工具记录卡头"><strong>读取项目文件</strong><time>10:20</time></div><div class="工具状态组"><span class="工具状态 工具状态-成功">成功</span><span class="工具状态 工具状态-已验证">已验证</span></div><div class="工具记录参数">renderer/style.css</div><div class="工具记录摘要">已读取抽屉与弹层的原始样式。</div></article>',
      '<article class="工具记录卡 需注意"><div class="工具记录卡头"><strong>视觉验收</strong><time>10:23</time></div><div class="工具记录提醒">自动检查通过后，仍需人工确认观感。</div></article>'
    ].join('')

    document.getElementById('上下文统计').textContent = '本轮使用 3 项依据'
    document.getElementById('上下文记录').innerHTML = [
      '<div class="工具记录摘要">当前只处理阶段 3，不触碰记忆库、账本和 Live2D。</div>',
      '<article class="工具记录卡"><div class="工具记录卡头"><strong>近期决定</strong></div><div class="工具记录参数">保留粉色风格、界面分布和既有交互逻辑。</div><div class="工具记录摘要">来源：共同协作记录</div></article>',
      '<article class="工具记录卡"><div class="工具记录卡头"><strong>完成标准</strong></div><div class="工具记录参数">六类面板布局不变，开合流畅，正文可复制。</div></article>'
    ].join('')

    document.getElementById('密钥状态').textContent = '已安全保存 · 界面不会读回完整 Key'
    document.getElementById('搜索供应商状态').textContent = '当前：DeepSeek 原生搜索'
    document.getElementById('搜索密钥状态').textContent = '未填写 SerpAPI Key'
    document.getElementById('麦克风设备状态').textContent = '系统默认麦克风可用'
    document.getElementById('主动陪伴状态').textContent = '已开启 · 当前处于安静时段外'

    document.getElementById('表达反馈统计').textContent = '2 条真实回复 · 当前只读'
    document.getElementById('表达反馈列表').innerHTML = [
      '<article class="表达反馈卡"><div class="表达反馈卡标签"><span>套路句式</span></div><div class="表达反馈正文">这句开头太像固定模板，换成更自然的回应会更好。</div><div class="表达反馈来源">对话：界面细节 · 2026-10-22</div></article>',
      '<article class="表达反馈卡"><div class="表达反馈卡标签"><span>不像她</span></div><div class="表达反馈正文">语气应该更轻盈一些，但不要重复原作台词。</div><div class="表达反馈来源">对话：表达优化 · 2026-10-21</div></article>'
    ].join('')

    const 目标 = {
      文件: '文件抽屉', 工作索引: '工作索引抽屉', 工具记录: '工具记录遮罩',
      上下文: '上下文遮罩', 设置: '设置遮罩', 表达反馈: '表达反馈遮罩',
    }[场景]
    const 面板 = document.getElementById(目标)
    面板.classList.remove('收着')
    if (面板.hasAttribute('aria-hidden')) 面板.setAttribute('aria-hidden', 'false')
    if (场景 === '设置') document.querySelector('.设置面板').scrollTop = 0

    await new Promise((resolve) => setTimeout(resolve, 280))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    const 选择器 = {
      文件: '.文件抽屉', 工作索引: '.工作索引抽屉', 工具记录: '#工具记录遮罩 .工具记录面板',
      上下文: '#上下文遮罩 .工具记录面板', 设置: '.设置面板', 表达反馈: '.表达反馈面板',
    }[场景]
    const 元素 = document.querySelector(选择器)
    const r = 元素.getBoundingClientRect()
    const 样式 = getComputedStyle(元素)
    const 遮罩 = ['工具记录', '上下文', '设置', '表达反馈'].includes(场景)
      ? getComputedStyle(面板) : null

    面板.classList.add('收着')
    const 已收起 = 面板.classList.contains('收着')
    面板.classList.remove('收着')
    const 已展开 = !面板.classList.contains('收着')
    if (面板.hasAttribute('aria-hidden')) 面板.setAttribute('aria-hidden', 'false')

    const 固定标题 = 场景 === '文件' ? '.文件标题'
      : 场景 === '工作索引' ? '.工作索引头 strong'
      : 场景 === '设置' ? '.设置头 h2'
      : 场景 === '表达反馈' ? '.表达反馈头 h2'
      : '#' + 目标 + ' .工具记录头 h2'
    const 正文 = 场景 === '文件' ? '.文件正文'
      : 场景 === '工作索引' ? '.工作索引目标'
      : 场景 === '设置' ? '#密钥输入'
      : 场景 === '表达反馈' ? '.表达反馈正文'
      : '#' + 目标 + ' .工具记录参数'

    return {
      rectangle: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      style: {
        background: 样式.background, border: 样式.border, boxShadow: 样式.boxShadow,
        backdropFilter: 样式.backdropFilter || 样式.webkitBackdropFilter || '',
        transition: 样式.transition,
      },
      overlay: 遮罩 ? {
        backdropFilter: 遮罩.backdropFilter || 遮罩.webkitBackdropFilter || '', transition: 遮罩.transition,
      } : null,
      interaction: { 已收起, 已展开 },
      selection: {
        fixed: getComputedStyle(document.querySelector(固定标题)).userSelect,
        content: getComputedStyle(document.querySelector(正文)).userSelect,
      },
      overlayStyleLoaded: !![...document.styleSheets].find((表) => !表.disabled && (String(表.href || '').endsWith('/%E7%B2%89%E8%89%B2%E7%8E%BB%E7%92%83-%E5%BC%B9%E5%B1%82.css') || String(表.href || '').endsWith('/粉色玻璃-弹层.css'))),
    }
    } catch (错误) {
      return { __error: 错误.stack || 错误.message }
    }
  })()`
  try { new Function(源码) } catch (错误) {
    fs.mkdirSync(输出目录, { recursive: true })
    fs.writeFileSync(path.join(输出目录, 'UI阶段3-夹具调试.js'), 源码, 'utf8')
    throw 错误
  }
  const 结果 = await 窗口.webContents.executeJavaScript(源码)
  if (结果 && 结果.__error) throw new Error(`${场景}夹具失败：${结果.__error}`)
  return 结果
}

app.whenReady().then(async () => {
  let 窗口
  try {
    窗口 = new BrowserWindow({
      width: 620, height: 560, show: false, backgroundColor: '#fffafd',
      webPreferences: {
        preload: path.join(__dirname, '验收记忆关系图预载.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
      },
    })
    await 窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))
    if (禁用弹层玻璃) {
      await 窗口.webContents.executeJavaScript(`(() => {
        const 样式 = document.querySelector('link[href="粉色玻璃-弹层.css"]')
        if (样式) 样式.disabled = true
      })()`)
    }
    await 等待(900)
    fs.mkdirSync(输出目录, { recursive: true })

    const 快照 = {
      viewport: await 窗口.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`),
      scenes: {},
    }
    for (const 场景 of 场景们) {
      快照.scenes[场景] = await 注入场景(窗口, 场景)
      const 图片 = await 窗口.webContents.capturePage()
      fs.writeFileSync(path.join(输出目录, `UI阶段3-${标签}-${场景}.png`), 图片.toPNG())
    }

    for (const 场景 of 场景们) {
      const 当前 = 快照.scenes[场景]
      if (!当前.interaction.已收起 || !当前.interaction.已展开) throw new Error(`${场景}开合状态回归`)
      if (标签 === '改造后' && 当前.selection.content !== 'text') throw new Error(`${场景}正文不再可选择：${当前.selection.content}`)
      if (标签 === '改造后' && 当前.selection.fixed !== 'none') throw new Error(`${场景}固定标题仍可选择：${当前.selection.fixed}`)
    }

    if (标签 === '改造后') {
      const 前路径 = path.join(输出目录, 'UI阶段3-改造前.json')
      if (!fs.existsSync(前路径)) throw new Error('缺少阶段 3 改造前快照')
      const 前 = JSON.parse(fs.readFileSync(前路径, 'utf8'))
      for (const 场景 of 场景们) {
        const 当前 = 快照.scenes[场景]
        if (JSON.stringify(当前.rectangle) !== JSON.stringify(前.scenes[场景].rectangle)) {
          throw new Error(`${场景}布局发生变化：改造前=${JSON.stringify(前.scenes[场景].rectangle)} 改造后=${JSON.stringify(当前.rectangle)}`)
        }
        if (!当前.overlayStyleLoaded) throw new Error(`${场景}阶段 3 样式没有生效`)
        if (/\ball\b/i.test(当前.style.transition) || (当前.overlay && /\ball\b/i.test(当前.overlay.transition))) {
          throw new Error(`${场景}仍使用 transition: all`)
        }
        if (['文件', '工作索引'].includes(场景) && 当前.style.backdropFilter !== 'none') {
          throw new Error(`${场景}抽屉错误启用了背景模糊`)
        }
      }
    }

    const 快照路径 = path.join(输出目录, `UI阶段3-${标签}.json`)
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ UI 阶段 3 ${标签}六场景截图完成`)
    console.log(`✓ UI 阶段 3 ${标签}快照：${快照路径}`)
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (窗口 && !窗口.isDestroyed()) 窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 保留验收结果优先 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
  }
})

setTimeout(() => app.exit(2), 30000).unref()
