/**
 * 阶段 5 Live2D 小界面视觉夹具。
 * 屏蔽所有页面脚本，只加载正式 HTML/CSS，分别检查加载提示与 380×360 快聊外观；
 * 不加载模型、不触碰物理参数，也不读取真实聊天、记忆或设置。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, session } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前').replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用玻璃 = process.env.ELYSIA_UI_DISABLE_LIVE2D_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-live2d-surfaces-'))
const 输出目录 = path.join(项目根, '.cache')
const 快照路径 = path.join(输出目录, `UI阶段5-Live2D-${标签}.json`)

app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

app.whenReady().then(async () => {
  let 加载窗口
  let 快聊窗口
  try {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['file:///*'] }, (详情, 回调) => {
      回调({ cancel: /\.(?:c?js)(?:\?|$)/i.test(详情.url) })
    })

    加载窗口 = new BrowserWindow({
      width: 430, height: 530, show: false, frame: false, transparent: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    })
    快聊窗口 = new BrowserWindow({
      width: 380, height: 360, show: false, frame: false, backgroundColor: '#fffafd',
      webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    })

    await 加载窗口.loadFile(path.join(项目根, 'renderer', 'live2d.html'))
    await 快聊窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))

    if (禁用玻璃) {
      await 加载窗口.webContents.executeJavaScript(`document.querySelector('link[href="live2d-粉色玻璃.css"]')?.remove()`)
      await 快聊窗口.webContents.executeJavaScript(`document.querySelector('link[href="粉色玻璃-Live2D快聊.css"]')?.remove()`)
    }

    await 快聊窗口.webContents.executeJavaScript(`(() => {
      document.body.className = '快聊模式'
      const 聊天区 = document.getElementById('聊天区')
      聊天区.innerHTML = [
        '<div class="一条 她的"><div class="气泡">嗨，我就在这里。想说什么都可以。</div></div>',
        '<div class="一条 他的"><div class="气泡">陪我聊一会儿吧。</div></div>',
        '<div class="一条 她的"><div class="气泡">当然啦，慢慢说就好。</div></div>'
      ].join('')
      document.getElementById('状态').textContent = '快聊'
      document.getElementById('输入').value = ''
      document.getAnimations().forEach((动画) => 动画.finish())
    })()`)
    await 等待(300)

    const 加载 = await 加载窗口.webContents.executeJavaScript(`(async () => {
      const 元素 = document.getElementById('加载状态')
      const 矩形 = 元素.getBoundingClientRect()
      const 样式 = getComputedStyle(元素)
      元素.classList.add('好了')
      document.getAnimations().forEach((动画) => 动画.finish())
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const 已隐藏 = getComputedStyle(元素).opacity === '0' && getComputedStyle(元素).visibility === 'hidden'
      元素.classList.remove('好了')
      document.getAnimations().forEach((动画) => 动画.cancel())
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rectangle: { x: Math.round(矩形.x), y: Math.round(矩形.y), width: Math.round(矩形.width), height: Math.round(矩形.height) },
        style: {
          background: 样式.background, border: 样式.border, boxShadow: 样式.boxShadow,
          backdropFilter: 样式.backdropFilter || 样式.webkitBackdropFilter || '', transition: 样式.transition,
        },
        loaded: !!document.querySelector('link[href="live2d-粉色玻璃.css"]'),
        已隐藏,
      }
    })()`)
    // 上面既验证了完成态淡出，也把类名移除了；等反向淡入结束再截图，避免把过渡中间帧当成常态。
    await 等待(350)

    const 快聊 = await 快聊窗口.webContents.executeJavaScript(`(() => {
      const 取矩形 = (选择器) => {
        const 矩形 = document.querySelector(选择器).getBoundingClientRect()
        return { x: Math.round(矩形.x), y: Math.round(矩形.y), width: Math.round(矩形.width), height: Math.round(矩形.height) }
      }
      const 取样式 = (选择器) => {
        const 样式 = getComputedStyle(document.querySelector(选择器))
        return {
          background: 样式.background, border: 样式.border, boxShadow: 样式.boxShadow,
          backdropFilter: 样式.backdropFilter || 样式.webkitBackdropFilter || '', transition: 样式.transition,
          userSelect: 样式.userSelect,
        }
      }
      const 输入 = document.getElementById('输入')
      输入.focus()
      输入.value = '快聊输入仍可编辑'
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rectangles: {
          body: 取矩形('body'), header: 取矩形('.顶栏'), chat: 取矩形('.聊天区'),
          herBubble: 取矩形('.一条.她的 .气泡'), myBubble: 取矩形('.一条.他的 .气泡'),
          composer: 取矩形('.输入区'), input: 取矩形('#输入'), send: 取矩形('#发送'),
        },
        styles: {
          body: 取样式('body'), header: 取样式('.顶栏'), herBubble: 取样式('.一条.她的 .气泡'),
          myBubble: 取样式('.一条.他的 .气泡'),
          composer: 取样式('.输入区'), input: 取样式('#输入'), send: 取样式('#发送'),
        },
        interaction: { inputFocused: document.activeElement === 输入, inputValue: 输入.value },
        loaded: !!document.querySelector('link[href="粉色玻璃-Live2D快聊.css"]'),
      }
    })()`)

    // Windows 150% DPI 下 360 DIP 的无边框窗口可能量化为 362px；改造前后仍须完全一致。
    if (加载.viewport.width !== 430 || 加载.viewport.height !== 530 ||
        Math.abs(快聊.viewport.width - 380) > 2 || Math.abs(快聊.viewport.height - 360) > 2) {
      throw new Error('Live2D 小界面视口变化：' + JSON.stringify({ 加载: 加载.viewport, 快聊: 快聊.viewport }))
    }
    if (!加载.已隐藏 || !快聊.interaction.inputFocused || 快聊.interaction.inputValue !== '快聊输入仍可编辑') {
      throw new Error('加载提示或快聊输入交互回归')
    }

    const 快照 = { 加载, 快聊 }
    if (标签 === '改造后') {
      const 改造前路径 = path.join(输出目录, 'UI阶段5-Live2D-改造前.json')
      if (!fs.existsSync(改造前路径)) throw new Error('缺少 Live2D 小界面改造前快照')
      const 改造前 = JSON.parse(fs.readFileSync(改造前路径, 'utf8'))
      if (JSON.stringify(加载.rectangle) !== JSON.stringify(改造前.加载.rectangle) ||
          JSON.stringify(快聊.rectangles) !== JSON.stringify(改造前.快聊.rectangles)) {
        throw new Error(`Live2D 小界面布局发生变化：改造前=${JSON.stringify(改造前)} 改造后=${JSON.stringify(快照)}`)
      }
      if (!加载.loaded || !快聊.loaded) throw new Error('Live2D 小界面覆盖层未加载')
      const 内层样式 = [加载.style, 快聊.styles.header, 快聊.styles.herBubble, 快聊.styles.myBubble, 快聊.styles.composer, 快聊.styles.input]
      if (内层样式.some((样式) => 样式.backdropFilter && 样式.backdropFilter !== 'none')) throw new Error('Live2D 小界面存在重复背景模糊')
      const 动效样式 = [加载.style, 快聊.styles.body, 快聊.styles.header, 快聊.styles.herBubble, 快聊.styles.myBubble, 快聊.styles.composer, 快聊.styles.input, 快聊.styles.send]
      if (动效样式.some((样式) => /\ball\b/i.test(样式.transition))) throw new Error('Live2D 小界面使用 transition: all')
    }

    fs.mkdirSync(输出目录, { recursive: true })
    const 加载图 = await 加载窗口.webContents.capturePage({ x: 80, y: 430, width: 270, height: 90 })
    const 快聊图 = await 快聊窗口.webContents.capturePage()
    fs.writeFileSync(path.join(输出目录, `UI阶段5-Live2D-${标签}-加载提示.png`), 加载图.toPNG())
    fs.writeFileSync(path.join(输出目录, `UI阶段5-Live2D-${标签}-快聊.png`), 快聊图.toPNG())
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ 阶段 5 Live2D ${标签}：加载提示与快聊截图完成`)
    console.log(`✓ 快照：${快照路径}`)
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (加载窗口 && !加载窗口.isDestroyed()) 加载窗口.destroy() } catch { /* 继续退出 */ }
    try { if (快聊窗口 && !快聊窗口.isDestroyed()) 快聊窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 验收结果优先 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 300).unref()
  }
})

setTimeout(() => app.exit(2), 15000).unref()
