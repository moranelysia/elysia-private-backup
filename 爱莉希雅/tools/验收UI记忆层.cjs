/**
 * 阶段 4 的 Electron 视觉与交互验收夹具。
 * 固定生成长期列表、临时记忆、日记和关系图四种状态；只写 .cache，不写真实记忆或关系。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前')
  .replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用记忆玻璃 = process.env.ELYSIA_UI_DISABLE_MEMORY_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-memory-'))
const 输出目录 = path.join(项目根, '.cache')
const 场景们 = ['长期列表', '临时记忆', '日记', '关系图']

process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_UI_MODE_FIXTURE = 'work'
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

const 长期数据 = {
  好: true, 总数: 3, 列表: [
    { 编号: 'f-1', 类别: '事实', 记忆类型: 'semantic', 时间: '2026/10/23 10:12', 内容: '用户喜欢保留粉色风格和爱莉希雅元素。', 来源: '用户本人', 会话标题: '界面优化' },
    { 编号: 'e-1', 类别: '经历', 记忆类型: 'episodic', 时间: '2026/10/22 19:30', 内容: '共同完成了长期记忆关系图，并确认卡片固定、画布只允许平移。', 来源: '共同经历', 会话标题: '记忆系统 P2' },
    { 编号: 'n-1', 类别: '小本子', 记忆类型: 'procedural', 时间: '2026/10/21 21:08', 内容: '用户说“继续”时只推进一个明确阶段，完成后留下人工验收步骤。', 来源: '用户本人', 会话标题: '共同协作' },
  ],
}

const 临时数据 = {
  好: true, 总数: 2, 列表: [
    { 编号: 't-1', 类别: '近期计划', 记忆类型: 'episodic', 生命周期: '有效', 确认状态: '已确认', 重要性: 2, 内容: '完成记忆库和关系图的界面层次优化。', 标签: ['界面', '阶段四'], 到期于: '2026-10-30T10:00:00.000Z', 来源: { 提取方式: '用户原话', 对话: '当前对话' }, 关系: { 状态: '当前' } },
    { 编号: 't-2', 类别: '候选偏好', 记忆类型: 'semantic', 生命周期: '有效', 确认状态: '待确认', 重要性: 3, 内容: '关系图应保持清晰、可交互，同时减少卡顿。', 标签: ['性能', '图谱'], 到期于: '2026-10-29T10:00:00.000Z', 来源: { 提取方式: '自动提取', 对话: '当前对话' }, 关系: { 状态: '待处理', 关联内容: '关系图使用多层模糊表现玻璃质感。' } },
  ],
}

const 日记数据 = {
  好: true, 总数: 2, 列表: [
    { 编号: 'd-1', 类型: '日', 周期: '2026-10-22', 标题: '把记忆串成有顺序的故事', 状态: '已完成', 生成于: '2026-10-23T00:10:00.000Z', 版本标记: 'v1', 模块: [
      { 名字: '共同完成', 正文: '完成长期记忆关系图、自动关系整理与一跳召回。', 来源: ['s-1'] },
      { 名字: '仍要留意', 正文: '所有自动关系都要保留依据，并允许人工修正。', 来源: [] },
    ], 来源: [{ 编号: 's-1', 类型: '对话', 时间: '22:10', 标题: '记忆系统 P2', 摘要: '确认了关系图的交互和时间线顺序。' }] },
    { 编号: 'w-1', 类型: '周', 周期: '2026-W43', 标题: '本周回顾', 状态: '已完成', 生成于: '2026-10-23T00:12:00.000Z', 版本标记: 'v1', 模块: [
      { 名字: '进展', 正文: '完成 UI 粉色液态玻璃前三个阶段。', 来源: [] },
    ], 来源: [] },
  ],
}

const 图数据 = {
  好: true, 自动关系总数: 1, 候选关系: [], 失效关系数: 0, 布局: { 视图: { x: 18, y: 18, 缩放: 1 } },
  节点: [
    { 键: '事实:f-1', 编号: 'f-1', 类别: '事实', 记忆类型: 'semantic', 时间: '2026/10/23', 内容: '用户喜欢保留粉色风格和爱莉希雅元素。', 来源: '用户本人', 会话标题: '界面优化', 事件时间: { 排序键: '2026-10-23' } },
    { 键: '经历:e-1', 编号: 'e-1', 类别: '经历', 记忆类型: 'episodic', 时间: '2026/10/22', 内容: '共同完成了长期记忆关系图。', 来源: '共同经历', 会话标题: '记忆系统 P2', 事件时间: { 排序键: '2026-10-22' } },
    { 键: '小本子:n-1', 编号: 'n-1', 类别: '小本子', 记忆类型: 'procedural', 时间: '2026/10/21', 内容: '继续时只推进一个明确阶段。', 来源: '用户本人', 会话标题: '共同协作', 事件时间: { 排序键: '2026-10-21' } },
  ],
  关系: [
    { 编号: 'r-1', 类型: '同一主题', 从键: '事实:f-1', 到键: '经历:e-1', 从: { 类别: '事实', 编号: 'f-1' }, 到: { 类别: '经历', 编号: 'e-1' }, 来源: '自动整理', 自动依据: { 置信度: 0.96, 依据: '都与记忆界面优化有关' } },
    { 编号: 'r-2', 类型: '后续发展', 从键: '经历:e-1', 到键: '小本子:n-1', 从: { 类别: '经历', 编号: 'e-1' }, 到: { 类别: '小本子', 编号: 'n-1' }, 来源: '人工' },
  ],
}

async function 注入场景(窗口, 场景) {
  const 数据 = 场景 === '长期列表' ? 长期数据 : 场景 === '临时记忆' ? 临时数据 : 场景 === '日记' ? 日记数据 : 图数据
  const 源码 = `(async () => {
    try {
      const 场景 = ${JSON.stringify(场景)}
      const 数据 = ${JSON.stringify(数据)}
      const 遮罩 = document.getElementById('记忆管理遮罩')
      const 面板 = document.querySelector('.记忆管理面板')
      遮罩.classList.remove('收着')
      遮罩.setAttribute('aria-hidden', 'false')

      const 层 = 场景 === '临时记忆' ? '临时' : 场景 === '日记' ? '日记' : '长期'
      当前记忆层 = 层
      当前长期视图 = 场景 === '关系图' ? '关系图' : '列表'
      for (const 按钮 of document.querySelectorAll('.记忆层切换 button')) {
        const 选中 = 按钮.dataset.记忆层 === 层
        按钮.classList.toggle('选中', 选中)
        按钮.setAttribute('aria-selected', String(选中))
      }
      document.getElementById('长期记忆筛选').classList.toggle('收着', 层 !== '长期')
      document.getElementById('长期记忆视图切换').classList.toggle('收着', 层 !== '长期')
      document.getElementById('临时记忆筛选').classList.toggle('收着', 层 !== '临时')
      document.getElementById('日记筛选').classList.toggle('收着', 层 !== '日记')
      面板.classList.toggle('图谱模式', 场景 === '关系图')
      document.getElementById('临时记忆新增').hidden = 层 !== '临时'
      document.getElementById('记忆搜索').value = ''

      if (场景 === '长期列表') 画长期记忆(数据)
      else if (场景 === '临时记忆') 画临时记忆(数据)
      else if (场景 === '日记') 画记忆日记(数据)
      else {
        for (const 按钮 of document.querySelectorAll('[data-长期视图]')) {
          const 选中 = 按钮.dataset.长期视图 === '关系图'
          按钮.classList.toggle('选中', 选中)
          按钮.setAttribute('aria-selected', String(选中))
        }
        画长期记忆关系图(数据)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        document.querySelector('.关系图卡片')?.click()
      }

      await new Promise((resolve) => setTimeout(resolve, 场景 === '关系图' ? 900 : 700))
      // 隐藏窗口里 Chromium 偶尔暂停合成动画；验收最终布局前把已开始的开场过渡推进到终点。
      for (const 动画 of 面板.getAnimations()) 动画.finish()
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const 矩形 = (元素) => {
        const r = 元素.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
      }
      const 样式 = (元素) => {
        const s = getComputedStyle(元素)
        return { background: s.background, boxShadow: s.boxShadow, backdropFilter: s.backdropFilter || s.webkitBackdropFilter || '', transition: s.transition, transform: s.transform, userSelect: s.userSelect }
      }
      const 内容 = 场景 === '日记' ? document.querySelector('.日记正文') : 场景 === '关系图' ? document.querySelector('.关系图卡片 p') : document.querySelector('.记忆内容')
      const 第一卡 = document.querySelector(场景 === '关系图' ? '.关系图卡片' : '.记忆卡')
      const 嵌套玻璃选择器 = ['.关系图工具栏', '.关系图卡片', '.关系图关联标签', '.关系图聚焦条', '.关系图编辑器', '.关系图确认卡']
      const 嵌套模糊数 = 场景 === '关系图' ? 嵌套玻璃选择器.reduce((和, 选择器) => {
        const 元素 = document.querySelector(选择器)
        if (!元素) return 和
        const 值 = getComputedStyle(元素).backdropFilter || getComputedStyle(元素).webkitBackdropFilter || ''
        return 和 + (值 && 值 !== 'none' ? 1 : 0)
      }, 0) : 0
      const 选中 = document.querySelector('.关系图卡片.选中记忆')
      const 视口 = document.querySelector('.关系图视口')
      const sr = 选中 && 选中.getBoundingClientRect(), vr = 视口 && 视口.getBoundingClientRect()
      const 居中距离 = sr && vr ? Math.round(Math.hypot(sr.left + sr.width / 2 - (vr.left + vr.width / 2), sr.top + sr.height / 2 - (vr.top + vr.height / 2))) : null
      const 面板矩形 = 矩形(面板)
      const 第一卡矩形 = 第一卡 ? 矩形(第一卡) : null
      const 面板样式 = 样式(面板)
      const 遮罩样式 = 样式(遮罩)
      const 第一卡样式 = 第一卡 ? 样式(第一卡) : null
      const 开关前 = !遮罩.classList.contains('收着')
      遮罩.classList.add('收着')
      const 已收起 = 遮罩.classList.contains('收着')
      遮罩.classList.remove('收着')
      const 已展开 = !遮罩.classList.contains('收着')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (const 动画 of [...遮罩.getAnimations(), ...面板.getAnimations()]) 动画.finish()
      return {
        panel: 面板矩形, firstCard: 第一卡矩形,
        styles: { panel: 面板样式, overlay: 遮罩样式, firstCard: 第一卡样式 },
        interaction: { 开关前, 已收起, 已展开, selected: !!选中, related: document.querySelectorAll('.关系图卡片.关联记忆').length, 居中距离, hasScale: (document.querySelector('.关系图世界')?.style.transform || '').includes('scale('), zoomButtons: [...document.querySelectorAll('.关系图工具栏 button')].filter((按钮) => /放大|缩小/.test(按钮.title + 按钮.textContent)).length },
        selection: { panel: getComputedStyle(面板).userSelect, content: 内容 ? getComputedStyle(内容).userSelect : '' },
        nestedBlurCount: 嵌套模糊数,
        phase4Loaded: !![...document.styleSheets].find((表) => !表.disabled && (String(表.href || '').endsWith('/%E7%B2%89%E8%89%B2%E7%8E%BB%E7%92%83-%E8%AE%B0%E5%BF%86.css') || String(表.href || '').endsWith('/粉色玻璃-记忆.css'))),
      }
    } catch (错误) { return { __error: 错误.stack || 错误.message } }
  })()`
  try { new Function(源码) } catch (错误) {
    fs.mkdirSync(输出目录, { recursive: true })
    fs.writeFileSync(path.join(输出目录, 'UI阶段4-夹具调试.js'), 源码, 'utf8')
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
      width: 1100, height: 760, show: false, backgroundColor: '#fffafd',
      webPreferences: {
        preload: path.join(__dirname, '验收记忆关系图预载.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
      },
    })
    await 窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))
    if (禁用记忆玻璃) {
      await 窗口.webContents.executeJavaScript(`(() => {
        const 样式 = document.querySelector('link[href="粉色玻璃-记忆.css"]')
        if (样式) 样式.disabled = true
      })()`)
    }
    await 等待(900)
    fs.mkdirSync(输出目录, { recursive: true })

    const 模式状态 = await 窗口.webContents.executeJavaScript(`(() => {
      const 按钮 = document.getElementById('模式开关')
      按钮.textContent = '干活'
      按钮.classList.add('干活模式')
      按钮.classList.remove('学习模式')
      const s = getComputedStyle(按钮)
      return { color: s.color, background: s.background, text: 按钮.textContent, className: 按钮.className, matched: 按钮.matches('.侧栏状态 .模式按钮.干活模式') }
    })()`)
    if (模式状态.color === 'rgb(255, 255, 255)') throw new Error('干活模式仍然使用白字')
    fs.writeFileSync(path.join(输出目录, 'UI-模式文字修复.png'), (await 窗口.webContents.capturePage()).toPNG())

    const 快照 = { viewport: { width: 1100, height: 760 }, mode: 模式状态, scenes: {} }
    for (const 场景 of 场景们) {
      快照.scenes[场景] = await 注入场景(窗口, 场景)
      fs.writeFileSync(path.join(输出目录, `UI阶段4-${标签}-${场景}.png`), (await 窗口.webContents.capturePage()).toPNG())
    }

    for (const 场景 of 场景们) {
      const 当前 = 快照.scenes[场景]
      if (!当前.interaction.开关前 || !当前.interaction.已收起 || !当前.interaction.已展开) throw new Error(`${场景}开合状态回归`)
      const 正文选择正确 = 场景 === '关系图' ? 当前.selection.content === 'none' : 当前.selection.content === 'text'
      if (当前.selection.panel !== 'none' || !正文选择正确) throw new Error(`${场景}选择边界回归：${JSON.stringify(当前.selection)}`)
      if (场景 === '关系图' && (!当前.interaction.selected || 当前.interaction.related < 1 || 当前.interaction.居中距离 > 4 || 当前.interaction.hasScale || 当前.interaction.zoomButtons)) throw new Error(`关系图聚焦或固定缩放回归：${JSON.stringify(当前.interaction)}`)
    }

    if (标签 === '改造后') {
      const 前路径 = path.join(输出目录, 'UI阶段4-改造前.json')
      if (!fs.existsSync(前路径)) throw new Error('缺少阶段 4 改造前快照')
      const 前 = JSON.parse(fs.readFileSync(前路径, 'utf8'))
      for (const 场景 of 场景们) {
        const 当前 = 快照.scenes[场景]
        if (JSON.stringify(当前.panel) !== JSON.stringify(前.scenes[场景].panel) || JSON.stringify(当前.firstCard) !== JSON.stringify(前.scenes[场景].firstCard)) throw new Error(`${场景}布局发生变化：改造前=${JSON.stringify({ panel: 前.scenes[场景].panel, firstCard: 前.scenes[场景].firstCard })} 改造后=${JSON.stringify({ panel: 当前.panel, firstCard: 当前.firstCard })}`)
        if (!当前.phase4Loaded) throw new Error(`${场景}阶段 4 样式没有生效`)
        if (/\ball\b/i.test(当前.styles.panel.transition) || /\ball\b/i.test(当前.styles.firstCard.transition)) throw new Error(`${场景}仍使用 transition: all`)
      }
      if (快照.scenes.关系图.nestedBlurCount !== 0) throw new Error(`关系图仍有 ${快照.scenes.关系图.nestedBlurCount} 层嵌套背景模糊`)
      if (!String(快照.scenes.关系图.styles.overlay.backdropFilter).includes('blur(6px)')) throw new Error('记忆库最外层轻模糊未生效')
    }

    const 快照路径 = path.join(输出目录, `UI阶段4-${标签}.json`)
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ UI 阶段 4 ${标签}四场景截图完成`)
    console.log(`✓ 模式文字颜色：${模式状态.color}`)
    console.log(`✓ UI 阶段 4 ${标签}快照：${快照路径}`)
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
