/** 离线检查顶栏和左侧状态卡的结构，不启动程序、不碰用户数据。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 根 = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
const css = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')
const js = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

const 顶栏 = /<header class="顶栏">([\s\S]*?)<\/header>/.exec(html)?.[1] || ''
const 侧栏 = /<aside class="侧栏">([\s\S]*?)<\/aside>/.exec(html)?.[1] || ''
const 状态们 = ['模式开关', '记忆开关', '任务开关', '工作区按钮']
const 详情 = /<div id="状态详情" class="侧栏状态详情 收着">([\s\S]*?)<\/div>\s*<\/section>/.exec(侧栏)?.[1] || ''

检查('顶栏不再堆放当前对话状态', 状态们.every((id) => !顶栏.includes(`id="${id}"`)))
检查('左侧有当前对话状态卡', 侧栏.includes('class="侧栏状态"'))
检查('模式、记忆、任务和工作区都在左侧状态卡', 状态们.every((id) => 侧栏.includes(`id="${id}"`)))
检查('四个交互节点都只有一个', 状态们.every((id) => (html.match(new RegExp(`id="${id}"`, 'g')) || []).length === 1))
检查('状态卡采用纵向布局', /\.侧栏状态\s*\{[\s\S]*?flex-direction:\s*column/.test(css))
检查('状态行有名称和值两端对齐', /\.侧栏状态 \.模式按钮,[\s\S]*?justify-content:\s*space-between/.test(css))
检查('统一行样式不会顶掉按模式隐藏', /\.侧栏状态 button\[hidden\]\s*\{\s*display:\s*none/.test(css))
检查('长期记忆状态使用清楚的开启/关闭文字', js.includes("? '开启' : '关闭'"))
检查('原有四个按钮行为仍按原 id 绑定', 状态们.every((id) => js.includes(`getElementById('${id}')`)))
检查('状态详情默认收起', 侧栏.includes('id="状态详情" class="侧栏状态详情 收着"'))
检查('模式开关留在折叠区外', 侧栏.indexOf('id="模式开关"') < 侧栏.indexOf('id="状态详情"'))
检查('长期记忆、记忆库、任务和工作区都收进详情', ['记忆开关', '记忆管理入口', '任务开关', '工作区按钮'].every((id) => 详情.includes(`id="${id}"`)))
检查('详情开关默认声明为收起', 侧栏.includes('id="状态详情开关"') && 侧栏.includes('aria-expanded="false"'))
检查('收起样式完全隐藏详情', /\.侧栏状态详情\.收着\s*\{\s*display:\s*none/.test(css))
检查('详情开关同步可访问状态', js.includes("状态详情开关.setAttribute('aria-expanded', String(要展开))"))

console.log(`\n界面布局：${通过}/${总数} 通过`)
