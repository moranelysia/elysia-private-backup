/** 工作索引侧栏：只用系统临时目录，不调用模型，不碰真实工作索引。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-work-index-panel-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件) {
  总数++
  if (!条件) throw new Error('✗ ' + 说明)
  通过++
  console.log('✓ ' + 说明)
}

async function main() {
  const 工作索引 = require(path.join(项目根, '脑', '工作索引.cjs'))
  工作索引.登记({ 对话: 'chat-a', 目标: '生成课程报告', 工作区: 'F:\\课程', 结果摘要: '报告已写好', 工具们: [{ 名字: '写', 结果: { 好: true, 路径: 'F:\\课程\\报告.md' } }], 产物们: ['F:\\课程\\报告.md'] })
  工作索引.登记({ 对话: 'chat-b', 目标: '整理两份数据', 结果摘要: '第二份失败', 工具们: [{ 名字: '读', 结果: { 好: true } }, { 名字: '写', 结果: { 好: false } }] })
  工作索引.登记({ 对话: 'chat-c', 目标: '运行不存在的命令', 结果摘要: '没有执行成功', 工具们: [{ 名字: '跑', 结果: { 好: false } }] })

  const 全部 = 工作索引.给界面()
  检查('界面列表按最新在前返回', 全部.列表.length === 3 && 全部.列表[0].对话 === 'chat-c')
  检查('界面记录保留三种真实状态', 全部.列表.map((一) => 一.状态).join(',') === '失败,部分完成,已完成')
  检查('能按状态筛选', 工作索引.给界面({ 状态: '部分完成' }).列表[0].对话 === 'chat-b')
  检查('未知状态安全回退为全部', 工作索引.给界面({ 状态: '随便写' }).总数 === 3)
  检查('能搜索目标', 工作索引.给界面({ 搜索: '课程报告' }).总数 === 1)
  检查('能搜索结果摘要', 工作索引.给界面({ 搜索: '第二份失败' }).总数 === 1)
  检查('能搜索产物路径', 工作索引.给界面({ 搜索: '报告.md' }).总数 === 1)
  检查('能搜索所属对话', 工作索引.给界面({ 搜索: 'chat-c' }).总数 === 1)
  检查('界面视图保留产物按钮所需路径', 全部.列表[2].产物[0] === 'F:\\课程\\报告.md')

  const 原始 = JSON.parse(fs.readFileSync(工作索引.索引文件, 'utf8'))
  原始[0].内部字段 = '不能给网页'
  fs.writeFileSync(工作索引.索引文件, JSON.stringify(原始), 'utf8')
  检查('界面只收到白名单字段', !Object.prototype.hasOwnProperty.call(工作索引.给界面().列表[2], '内部字段'))

  fs.writeFileSync(工作索引.索引文件, '{损坏', 'utf8')
  let 损坏错误 = ''
  try { 工作索引.给界面() } catch (错误) { 损坏错误 = 错误.message }
  检查('损坏索引明确报错而不是伪装空列表', /已取消写入/.test(损坏错误))
  检查('只读失败不会覆盖损坏文件', fs.readFileSync(工作索引.索引文件, 'utf8') === '{损坏')

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const 页面 = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  const 样式 = fs.readFileSync(path.join(项目根, 'renderer', 'style.css'), 'utf8')

  检查('主进程提供只读工作索引 IPC', 主进程.includes("ipcMain.handle('问工作索引'") && 主进程.includes('工作索引.给界面'))
  检查('预载只传搜索和状态', 预载.includes('问工作索引:') && preloadedSafe(预载))
  检查('左侧折叠区有工作记录入口', 页面.includes('id="工作索引入口"') && 页面.includes('id="状态详情"'))
  检查('右侧抽屉有搜索和四档筛选', 页面.includes('id="工作索引抽屉"') && 页面.includes('id="工作索引搜索"') && (页面.match(/data-状态=/g) || []).length >= 4)
  检查('工作记录只在工作模式显示', 前端.includes("工作索引入口.hidden = 当前模式 !== 'work'"))
  检查('新记录完成后自动刷新', 前端.includes('回执.工作索引编号') && 前端.includes('void 刷新工作索引()'))
  检查('索引产物仍走安全文件抽屉', 前端.includes("按钮.addEventListener('click', () => void 打开文件抽屉(路径))"))
  检查('三种右侧抽屉互斥', 前端.includes('收起工作索引抽屉()') && 前端.includes('收起文件抽屉()') && 前端.includes('收起任务抽屉()'))
  检查('界面使用 textContent 绘制索引数据', 前端.includes('目标.textContent = 一.目标') && 前端.includes('结果.textContent = 一.结果摘要'))
  检查('样式包含小窗口自适应宽度', 样式.includes('.工作索引抽屉') && 样式.includes('width: min(360px, 100%)'))

  console.log(`\n工作索引侧栏：${通过}/${总数} 通过`)
}

function preloadedSafe(预载) {
  const 开始 = 预载.indexOf('问工作索引:')
  const 结束 = 预载.indexOf('\n\n', 开始)
  const 片段 = 预载.slice(开始, 结束 > 开始 ? 结束 : 开始 + 400)
  return 片段.includes('搜索:') && 片段.includes('状态:') && !片段.includes('路径:')
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
