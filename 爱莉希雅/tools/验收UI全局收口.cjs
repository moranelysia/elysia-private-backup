/**
 * UI 粉色玻璃阶段 6 的总收口检查。
 * 先运行阶段 1–5 的 Electron 视觉夹具，再由本脚本统一核对布局、选择边界、模糊预算与源码禁用项。
 * 只读取源码和 .cache 快照，不读取或改写真正的聊天、记忆、设置与账本数据。
 */
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const 根 = path.resolve(__dirname, '..')
const 缓存 = path.join(根, '.cache')
const 样式文件 = [
  'renderer/粉色玻璃.css',
  'renderer/粉色玻璃-内容.css',
  'renderer/粉色玻璃-弹层.css',
  'renderer/粉色玻璃-记忆.css',
  'renderer/账本-粉色玻璃.css',
  'renderer/live2d-粉色玻璃.css',
  'renderer/粉色玻璃-Live2D快聊.css',
]

function 读文本(相对路径) {
  return fs.readFileSync(path.join(根, 相对路径), 'utf8')
}

function 读快照(名字) {
  const 文件 = path.join(缓存, 名字)
  if (!fs.existsSync(文件)) throw new Error(`缺少 ${名字}；请先重跑阶段 1–5 的“改造后”视觉夹具`)
  return JSON.parse(fs.readFileSync(文件, 'utf8'))
}

function 次数(正文, 片段) {
  return 正文.split(片段).length - 1
}

function 比矩形(名字, 前, 后) {
  assert.deepEqual(后, 前, `${名字}的关键矩形相对改造前发生变化`)
}

const 主页面 = 读文本('renderer/index.html')
const 账本页 = 读文本('renderer/账本.html')
const Live2D页 = 读文本('renderer/live2d.html')

for (const 引用 of ['粉色玻璃.css', '粉色玻璃-内容.css', '粉色玻璃-弹层.css', '粉色玻璃-记忆.css', '粉色玻璃-Live2D快聊.css']) {
  assert.equal(次数(主页面, `href="${引用}"`), 1, `主页面样式引用异常：${引用}`)
}
assert.equal(次数(账本页, 'href="账本-粉色玻璃.css"'), 1, '账本玻璃样式引用异常')
assert.equal(次数(Live2D页, 'href="live2d-粉色玻璃.css"'), 1, 'Live2D 加载提示样式引用异常')

let 模糊表面数 = 0
for (const 文件 of 样式文件) {
  const 正文 = 读文本(文件)
  assert.doesNotMatch(正文, /transition\s*:\s*all\b/i, `${文件} 出现 transition: all`)
  assert.doesNotMatch(正文, /filter\s*:\s*contrast\s*\(/i, `${文件} 出现高成本 contrast 滤镜`)
  assert.doesNotMatch(正文, /url\s*\(\s*['"]?#/i, `${文件} 出现 SVG/CSS 片段滤镜引用`)
  const 模糊们 = [...正文.matchAll(/(?<!-)backdrop-filter\s*:\s*blur\((\d+(?:\.\d+)?)px\)/gi)].map((匹配) => Number(匹配[1]))
  assert.ok(模糊们.every((数值) => 数值 <= 14), `${文件} 的背景模糊超过 14px：${模糊们.join(', ')}`)
  模糊表面数 += 模糊们.length
}
assert.equal(模糊表面数, 6, `外层背景模糊表面数量变化：${模糊表面数}`)

const 一前 = 读快照('UI阶段1-改造前.json')
const 一后 = 读快照('UI阶段1-改造后.json')
比矩形('阶段 1 常驻区', 一前.rectangles, 一后.rectangles)
assert.ok(一后.overlayLoaded && Object.values(一后.interaction).every(Boolean), '阶段 1 样式或常驻交互未通过')
assert.equal(一后.styles.statusCard.backdropFilter, 'none', '侧栏状态卡仍在重复模糊')

const 二前 = 读快照('UI阶段2-改造前.json')
const 二后 = 读快照('UI阶段2-改造后.json')
for (const 场景 of ['开场', '聊天', '任务']) {
  比矩形(`阶段 2 ${场景}`, 二前.scenes[场景].rectangles, 二后.scenes[场景].rectangles)
  assert.ok(二后.scenes[场景].contentStyleLoaded, `阶段 2 ${场景}样式未加载`)
  assert.ok(二后.scenes[场景].bubbleSelectable, `阶段 2 ${场景}正文不再可选择`)
}
assert.equal(二后.scenes.任务.styles.drawer.backdropFilter, 'none', '任务抽屉出现重复模糊')

const 三前 = 读快照('UI阶段3-改造前.json')
const 三后 = 读快照('UI阶段3-改造后.json')
for (const 场景 of ['文件', '工作索引', '工具记录', '上下文', '设置', '表达反馈']) {
  比矩形(`阶段 3 ${场景}`, 三前.scenes[场景].rectangle, 三后.scenes[场景].rectangle)
  assert.ok(三后.scenes[场景].overlayStyleLoaded, `阶段 3 ${场景}样式未加载`)
  assert.equal(三后.scenes[场景].selection.fixed, 'none', `阶段 3 ${场景}固定文字仍可选择`)
  assert.equal(三后.scenes[场景].selection.content, 'text', `阶段 3 ${场景}正文不再可选择`)
}

const 四前 = 读快照('UI阶段4-改造前.json')
const 四后 = 读快照('UI阶段4-改造后.json')
for (const 场景 of ['长期列表', '临时记忆', '日记', '关系图']) {
  比矩形(`阶段 4 ${场景}面板`, 四前.scenes[场景].panel, 四后.scenes[场景].panel)
  比矩形(`阶段 4 ${场景}首卡`, 四前.scenes[场景].firstCard, 四后.scenes[场景].firstCard)
  assert.ok(四后.scenes[场景].phase4Loaded, `阶段 4 ${场景}样式未加载`)
  assert.equal(四后.scenes[场景].nestedBlurCount, 0, `阶段 4 ${场景}仍有嵌套模糊`)
  assert.equal(四后.scenes[场景].selection.panel, 'none', `阶段 4 ${场景}固定界面文字仍可选择`)
}
assert.notEqual(四后.mode.color, 'rgb(255, 255, 255)', '侧栏模式文字又变回低对比白色')

const 账本前 = 读快照('UI阶段5-账本-改造前.json')
const 账本后 = 读快照('UI阶段5-账本-改造后.json')
比矩形('阶段 5 账本', 账本前.rectangles, 账本后.rectangles)
assert.ok(账本后.overlayLoaded, '账本玻璃样式未加载')
assert.equal(账本后.selectable.body, 'none', '账本固定文字仍可选择')
assert.ok(Object.values(账本后.styles).every((样式) => !样式.backdropFilter || 样式.backdropFilter === 'none'), '账本出现背景模糊')

const Live2D前 = 读快照('UI阶段5-Live2D-改造前.json')
const Live2D后 = 读快照('UI阶段5-Live2D-改造后.json')
比矩形('阶段 5 Live2D 加载提示', Live2D前.加载.rectangle, Live2D后.加载.rectangle)
比矩形('阶段 5 Live2D 快聊', Live2D前.快聊.rectangles, Live2D后.快聊.rectangles)
assert.ok(Live2D后.加载.loaded && Live2D后.加载.已隐藏 && Live2D后.快聊.loaded, 'Live2D 小界面样式或淡出未通过')
assert.ok(Live2D后.快聊.interaction.inputFocused && Live2D后.快聊.interaction.inputValue, '快聊输入不再可编辑')
for (const 样式 of Object.values(Live2D后.快聊.styles)) {
  assert.ok(!样式.backdropFilter || 样式.backdropFilter === 'none', '快聊内部出现背景模糊')
}

const 结果 = {
  时间: new Date().toISOString(),
  阶段: 6,
  样式覆盖层: 样式文件.length,
  外层模糊表面: 模糊表面数,
  布局场景: 1 + 3 + 6 + 4 + 1 + 2,
  选择边界: '通过',
  高频内部嵌套模糊: 0,
  源码禁用项: ['transition: all', 'filter: contrast()', 'SVG 片段滤镜'],
}
fs.writeFileSync(path.join(缓存, 'UI阶段6-全局收口.json'), JSON.stringify(结果, null, 2) + '\n', 'utf8')
console.log(`✓ UI 阶段 6 全局收口通过：${结果.布局场景} 个布局场景，${结果.样式覆盖层} 个独立覆盖层，内部嵌套模糊 0`)
console.log(`✓ 总结：${path.join(缓存, 'UI阶段6-全局收口.json')}`)
