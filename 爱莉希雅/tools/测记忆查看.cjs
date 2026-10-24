/** 记忆管理页第一步：只读查看、搜索和来源。全程使用系统临时目录。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-view-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 原文(文件) {
  try { return fs.readFileSync(文件, 'utf8') } catch { return '' }
}

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 会话 = 记忆.建新对话('高数复习', '', 'learn')
  const 事实 = 记忆.记一条('事实', '他正在复习微积分', '她', { 对话: 会话 })
  const 经历 = 记忆.记一条('经历', '一起做完第一章习题', '她', { 对话: 会话 })
  const 手写 = 记忆.记一条('小本子', '周五记得带校园卡', '我')

  检查('新记忆保存所属会话编号', 事实.对话 === 会话 && 经历.对话 === 会话)
  检查('手写记忆没有来源会话时不乱填', !手写.对话)

  const 全部 = 记忆.列长期记忆()
  检查('能列出三类长期记忆', 全部.好 === undefined && 全部.总数 === 3 && 全部.列表.length === 3)
  检查('列表包含必要字段', 全部.列表.every((一) => 一.编号 && 一.类别 && 一.内容 && 一.来源))
  检查('长期记忆保存或兼容补齐类型与人物元数据', 全部.列表.every((一) => 一.记忆类型 && 一.元数据 && 一.元数据.person && 一.元数据.relationship))
  检查('经历默认属于事件记忆并以她的视角显示共同经历', 全部.列表.find((一) => 一.编号 === 经历.编号).记忆类型 === 'episodic' && 全部.列表.find((一) => 一.编号 === 经历.编号).元数据.relationship === '我们的共同经历')
  检查('能把会话编号翻成会话标题', 全部.列表.find((一) => 一.编号 === 事实.编号).会话标题 === '高数复习')
  检查('没有会话来源时明确保持空白', 全部.列表.find((一) => 一.编号 === 手写.编号).会话标题 === '')

  const 只看事实 = 记忆.列长期记忆({ 类别: '事实' })
  检查('可以按类别筛选', 只看事实.总数 === 1 && 只看事实.列表[0].类别 === '事实')
  const 搜内容 = 记忆.列长期记忆({ 搜索: '微积分' })
  检查('可以搜索记忆内容', 搜内容.总数 === 1 && 搜内容.列表[0].编号 === 事实.编号)
  const 搜会话 = 记忆.列长期记忆({ 搜索: '高数复习' })
  检查('可以搜索来源会话', 搜会话.总数 === 2)
  const 搜来源 = 记忆.列长期记忆({ 搜索: '我' })
  检查('可以搜索记录者来源', 搜来源.总数 === 1 && 搜来源.列表[0].编号 === 手写.编号)
  检查('可以搜索人物与关系元数据', 记忆.列长期记忆({ 搜索: '共同经历' }).总数 === 1)
  检查('不认识的类别按全部处理', 记忆.列长期记忆({ 类别: '乱写' }).总数 === 3)
  检查('结果上限会被限制并说明截断', 记忆.列长期记忆({ 最多: 1 }).列表.length === 1 && 记忆.列长期记忆({ 最多: 1 }).截断)

  const 查前 = [记忆.事实文件, 记忆.经历文件, 记忆.小本子文件].map(原文)
  记忆.列长期记忆({ 搜索: '第一章', 类别: '经历' })
  const 查后 = [记忆.事实文件, 记忆.经历文件, 记忆.小本子文件].map(原文)
  检查('查看和搜索不会改写任何记忆文件', JSON.stringify(查前) === JSON.stringify(查后))

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  const css = fs.readFileSync(path.join(项目根, 'renderer', 'style.css'), 'utf8')

  检查('主进程提供只读记忆查询入口', 主进程.includes("ipcMain.handle('问长期记忆'"))
  检查('查询词在主进程限制为 80 字', 主进程.includes("String((条件 && 条件.搜索) || '').slice(0, 80)"))
  const 查询口起点 = 预载.indexOf('问长期记忆:')
  const 查询口终点 = 预载.indexOf('\n  }),', 查询口起点)
  const 查询口 = 预载.slice(查询口起点, 查询口终点 + 6)
  检查('预载只暴露筛选和搜索字段', 查询口.includes('条件.类别') && 查询口.includes('条件.搜索') && !/文件|路径|删除|修改/.test(查询口))
  检查('左侧有记忆库查看入口', html.includes('id="记忆管理入口"'))
  检查('记忆面板有分类和搜索', html.includes('id="记忆搜索"') && html.includes('data-类别="事实"') && html.includes('data-类别="经历"'))
  检查('前端明确显示旧记录来源未记录', 前端.includes('会话来源未记录'))
  检查('前端用 textContent 画记忆内容', 前端.includes("内容.textContent = 一.内容 || ''"))
  检查('Esc 和遮罩都能关闭记忆页', 前端.includes('关记忆管理()') && 前端.includes('事件.target === 记忆管理遮罩'))
  检查('记忆页样式不会撑出窗口', css.includes('height: min(640px, calc(100vh - 36px))') && css.includes('overflow-y: auto'))
  检查('固定界面文字不可选择但记忆正文和搜索输入仍可复制编辑', css.includes('.记忆管理面板 {\n  user-select: none;') && css.includes('.记忆搜索:placeholder-shown { user-select: none;') && css.includes('.记忆搜索:not(:placeholder-shown) { user-select: text;') && css.includes('.记忆内容') && css.includes('user-select: text; -webkit-user-select: text;'))
  检查('模型写记忆时会带上会话编号', fs.readFileSync(path.join(项目根, '脑', '对话.cjs'), 'utf8').includes('const 来源上下文 = { 对话: 选项.对话编号 }'))

  console.log(`\n记忆查看：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
