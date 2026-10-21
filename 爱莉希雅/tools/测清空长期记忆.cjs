/** 清空长期记忆：全部数据位于系统临时目录，不碰真实记忆和学习区。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-clear-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
process.env.ELYSIA_学习区 = path.join(临时根, '学习')

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
  let 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 会话 = 记忆.建新对话('清空测试会话', '', 'chat')
  记忆.记一条('事实', '他喜欢测试', '她', { 对话: 会话 })
  记忆.记一条('经历', '一起验证清空', '她', { 对话: 会话 })
  记忆.记一条('小本子', '不要误删其他数据', '她', { 对话: 会话 })
  fs.mkdirSync(process.env.ELYSIA_学习区, { recursive: true })
  const 学习文件 = path.join(process.env.ELYSIA_学习区, '进度.md')
  fs.writeFileSync(学习文件, '# 不该被清空\n', 'utf8')
  const 索引原文 = 原文(记忆.索引文件)

  const 果 = 记忆.清空全部长期记忆({ 当前: new Date('2026-10-12T13:14:15.016Z') })
  检查('一次清空三类共 3 条', 果.好 && 果.条数 === 3)
  检查('清空前备份已经创建', !!果.备份文件 && fs.existsSync(果.备份文件))
  const 备份 = JSON.parse(原文(果.备份文件))
  检查('备份保留三类原始数组', 备份.事实.length === 1 && 备份.经历.length === 1 && 备份.小本子.length === 1)
  检查('备份记录条数和时间', 备份.总数 === 3 && 备份.备份时间 === '2026-10-12T13:14:15.016Z')
  检查('事实文件写成空数组', JSON.parse(原文(记忆.事实文件)).length === 0)
  检查('经历文件写成空数组', JSON.parse(原文(记忆.经历文件)).length === 0)
  检查('小本子文件写成空数组', JSON.parse(原文(记忆.小本子文件)).length === 0)
  检查('管理列表立即变空', 记忆.全部长期记忆().length === 0)
  检查('对话索引完全没动', 原文(记忆.索引文件) === 索引原文)
  检查('学习进度完全没动', 原文(学习文件) === '# 不该被清空\n')

  delete require.cache[require.resolve(path.join(项目根, '脑', '记忆.cjs'))]
  记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  检查('重新加载后长期记忆仍为空', 记忆.全部长期记忆().length === 0)
  const 空果 = 记忆.清空全部长期记忆({ 当前: new Date('2026-10-12T13:15:00.000Z') })
  检查('重复清空明确报告没变化', 空果.好 && 空果.没变化 && 空果.条数 === 0)
  检查('空记忆不会再制造备份', !空果.备份文件)

  for (let i = 0; i < 12; i++) {
    记忆.记一条('事实', `轮换备份 ${i}`, '她')
    记忆.清空全部长期记忆({ 当前: new Date(Date.UTC(2026, 9, 13, 0, 0, i)) })
  }
  const 历史目录 = path.join(process.env.ELYSIA_DATA_DIR, '清空历史')
  检查('清空历史最多保留 10 份', fs.readdirSync(历史目录).filter((一) => 一.endsWith('.json')).length === 10)

  fs.writeFileSync(记忆.事实文件, '{坏掉', 'utf8')
  const 坏前 = 原文(记忆.事实文件)
  let 坏错 = ''
  try { 记忆.清空全部长期记忆() } catch (错误) { 坏错 = 错误.message }
  检查('损坏的记忆会拒绝清空', /读不动，已取消清空/.test(坏错))
  检查('拒绝后损坏原文件保持原样', 原文(记忆.事实文件) === 坏前)

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('主进程限制调用来源并使用系统确认框', 主进程.includes("ipcMain.handle('清空长期记忆'") && 主进程.includes('确认来自聊天窗口(事件)') && 主进程.includes("title: '清空长期记忆'"))
  检查('确认框说清不会删除聊天和学习', 主进程.includes('聊天记录、学习进度和设置都会保留'))
  检查('预载只暴露无参数清空入口', 预载.includes("清空长期记忆: () => ipcRenderer.invoke('清空长期记忆')"))
  检查('记忆页提供清空按钮', html.includes('id="记忆清空"') && html.includes('>清空…</button>'))
  检查('清空成功后界面立即刷新', 前端.includes('await window.爱莉.清空长期记忆()') && 前端.includes('await 刷新长期记忆()'))

  console.log(`\n清空长期记忆：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
