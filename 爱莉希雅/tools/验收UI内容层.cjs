/**
 * 阶段 2 的 Electron 视觉验收夹具。
 * 依次生成开场、聊天、任务三种固定状态；只写 .cache，不读写真实数据。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前')
  .replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用内容玻璃 = process.env.ELYSIA_UI_DISABLE_CONTENT_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-content-'))
const 输出目录 = path.join(项目根, '.cache')

process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

async function 注入场景(窗口, 场景) {
  const 源码 = `(async () => {
    const 场景 = ${JSON.stringify(场景)}
    let 验收样式 = document.getElementById('阶段2验收样式')
    if (!验收样式) {
      验收样式 = document.createElement('style')
      验收样式.id = '阶段2验收样式'
      验收样式.textContent = 'body.阶段2验收任务态 .任务抽屉 { display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 100 !important; }'
      document.head.appendChild(验收样式)
    }
    document.body.classList.toggle('阶段2验收任务态', 场景 === '任务')
    const 对话列表 = document.getElementById('对话列表')
    对话列表.innerHTML = [
      '<div class="对话行"><button class="对话 当前"><span class="对话标题">今天的计划</span><span class="对话小字">刚刚 · 12 条 · flash</span></button></div>',
      '<div class="对话行"><button class="对话"><span class="对话标题">记忆系统优化</span><span class="对话小字">昨天 · 38 条 · flash</span></button></div>',
      '<div class="对话行"><button class="对话 临时"><span class="对话标题">临时想法</span><span class="对话小字">本次运行 · 临时</span></button></div>'
    ].join('')
    const 聊天区 = document.getElementById('聊天区')
    for (const 节点 of [...聊天区.children]) {
      if (节点.id !== '更早' && 节点.id !== '开场') 节点.remove()
    }
    const 开场 = document.getElementById('开场')
    const 待发 = document.getElementById('待发')
    const 抽屉 = document.getElementById('任务抽屉')
    抽屉.classList.add('收着')
    抽屉.style.opacity = ''
    抽屉.style.pointerEvents = ''
    待发.classList.add('收着')
    待发.innerHTML = ''
    document.getElementById('小状态').textContent = 场景 === '开场' ? '点这儿看她的情况' : '上下文准备好了 · 可以继续聊天'
    const 工具入口 = document.getElementById('工具记录入口')
    工具入口.hidden = 场景 === '开场'
    工具入口.textContent = '工具调用 2'

    if (场景 !== '开场') {
      if (开场) 开场.style.display = 'none'
      聊天区.insertAdjacentHTML('beforeend', [
        '<div class="一条 他的"><div class="气泡">今天先把界面打磨得更自然一点。</div><div class="时间">10:22</div></div>',
        '<div class="一条 她的"><div class="气泡">好呀♪ 我会保留原来的粉色和位置，只让层次更清楚、操作更轻快。</div><div class="时间"><span>10:23</span><button class="重播声音">♪</button><button class="表达反馈按钮">◇</button></div></div>',
        '<div class="一条 他的"><div class="气泡">这张参考图也一起看看。<div class="附件条"><div class="一个"><span class="图标">▧</span><span>界面参考.png</span></div></div></div><div class="时间">10:24</div></div>'
      ].join(''))
      待发.classList.remove('收着')
      待发.innerHTML = '<div class="一个"><span class="图标">▧</span><span class="名字">新的配色参考.png</span><button class="去掉">×</button></div>'
      聊天区.scrollTop = 聊天区.scrollHeight
    } else if (开场) {
      开场.style.display = ''
    }

    if (场景 === '任务') {
      抽屉.classList.remove('收着')
      // 视觉夹具固定展示任务态，避免后台的聊天模式同步在截图前自动收起抽屉。
      抽屉.style.opacity = '1'
      抽屉.style.pointerEvents = 'auto'
      document.getElementById('任务计数').textContent = '2/4'
      document.getElementById('任务进度面').style.width = '50%'
      document.getElementById('任务列表').innerHTML = [
        '<div class="任务 做完"><span class="格子">✓</span><span class="字">确定视觉边界</span><button class="删掉">✕</button></div>',
        '<div class="任务 做完"><span class="格子">✓</span><span class="字">完成基础玻璃层</span><button class="删掉">✕</button></div>',
        '<div class="任务"><span class="格子"></span><span class="字">检查聊天内容层</span><button class="删掉">✕</button></div>',
        '<div class="任务"><span class="格子"></span><span class="字">人工确认点击手感</span><button class="删掉">✕</button></div>'
      ].join('')
    }

    // 等入场动画结束后再测量，避免把视觉 transform 误判为布局漂移。
    await new Promise((resolve) => setTimeout(resolve, 260))
    if (场景 === '任务') {
      // 模式状态可能在等待期间再次同步；截图前重新固定视觉夹具的任务态。
      抽屉.classList.remove('收着')
      抽屉.style.opacity = '1'
      抽屉.style.pointerEvents = 'auto'
      // executeJavaScript 返回并不等于 Chromium 已经把新层提交给合成器；等两帧再截。
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }

    const 矩形 = (选择器) => {
      const 元素 = document.querySelector(选择器)
      if (!元素) return null
      const r = 元素.getBoundingClientRect()
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
    }
    const 样式 = (选择器) => {
      const s = getComputedStyle(document.querySelector(选择器))
      return { background: s.background, boxShadow: s.boxShadow, backdropFilter: s.backdropFilter || s.webkitBackdropFilter || '', transition: s.transition, userSelect: s.userSelect, opacity: s.opacity }
    }
    return {
      rectangles: 场景 === '开场' ? {
        opening: 矩形('.开场'), avatar: 矩形('.开场头像'), status: 矩形('.小状态栏')
      } : 场景 === '聊天' ? {
        conversation: 矩形('.对话.当前'), assistantBubble: 矩形('.一条.她的 .气泡'), userBubble: 矩形('.一条.他的 .气泡'), pending: 矩形('.待发'), status: 矩形('.小状态栏')
      } : {
        drawer: 矩形('.任务抽屉'), task: 矩形('.任务:not(.做完)'), progress: 矩形('.任务进度条')
      },
      styles: 场景 === '开场' ? {
        opening: 样式('.开场')
      } : 场景 === '聊天' ? {
        conversation: 样式('.对话.当前'), assistantBubble: 样式('.一条.她的 .气泡'), userBubble: 样式('.一条.他的 .气泡'), pending: 样式('.待发'), status: 样式('.小状态栏')
      } : {
        drawer: 样式('.任务抽屉'), task: 样式('.任务:not(.做完)')
      },
      bubbleSelectable: 场景 === '开场' ? true : getComputedStyle(document.querySelector('.气泡')).userSelect === 'text',
      contentStyleLoaded: !![...document.styleSheets].find((表) => !表.disabled && (String(表.href || '').endsWith('/%E7%B2%89%E8%89%B2%E7%8E%BB%E7%92%83-%E5%86%85%E5%AE%B9.css') || String(表.href || '').endsWith('/粉色玻璃-内容.css'))),
    }
  })()`
  return 窗口.webContents.executeJavaScript(源码)
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
    if (禁用内容玻璃) {
      await 窗口.webContents.executeJavaScript(`(() => {
        const 样式 = document.querySelector('link[href="粉色玻璃-内容.css"]')
        if (样式) 样式.disabled = true
      })()`)
    }
    await 等待(900)
    fs.mkdirSync(输出目录, { recursive: true })

    const 快照 = { viewport: await 窗口.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`), scenes: {} }
    for (const 场景 of ['开场', '聊天', '任务']) {
      快照.scenes[场景] = await 注入场景(窗口, 场景)
      const 图片 = await 窗口.webContents.capturePage()
      fs.writeFileSync(path.join(输出目录, `UI阶段2-${标签}-${场景}.png`), 图片.toPNG())
    }

    if (!快照.scenes.聊天.bubbleSelectable) throw new Error('聊天气泡正文不再可选择')
    if (标签 === '改造后') {
      const 前路径 = path.join(输出目录, 'UI阶段2-改造前.json')
      if (!fs.existsSync(前路径)) throw new Error('缺少阶段 2 改造前快照')
      const 前 = JSON.parse(fs.readFileSync(前路径, 'utf8'))
      for (const 场景 of ['开场', '聊天', '任务']) {
        if (JSON.stringify(快照.scenes[场景].rectangles) !== JSON.stringify(前.scenes[场景].rectangles)) {
          throw new Error(`${场景}布局发生变化`)
        }
      }
      if (!快照.scenes.开场.contentStyleLoaded || 快照.scenes.任务.styles.drawer.backdropFilter !== 'none') {
        throw new Error('阶段 2 样式未生效，或任务抽屉错误启用了背景模糊')
      }
      const 高频过渡 = [快照.scenes.聊天.styles.conversation.transition, 快照.scenes.任务.styles.task.transition]
      if (高频过渡.some((值) => /\ball\b/i.test(值))) throw new Error('内容层高频交互仍使用 transition: all')
    }

    const 快照路径 = path.join(输出目录, `UI阶段2-${标签}.json`)
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ UI 阶段 2 ${标签}三场景截图完成`)
    console.log(`✓ UI 阶段 2 ${标签}快照：${快照路径}`)
    console.log(JSON.stringify(快照))
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

setTimeout(() => app.exit(2), 20000).unref()
