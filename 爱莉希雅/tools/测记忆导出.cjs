/** 长期记忆完整导出。数据放系统临时目录，不接模型，也不碰真实记忆。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-export-'))
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

async function main() {
  const 记忆目录 = process.env.ELYSIA_DATA_DIR
  fs.mkdirSync(记忆目录, { recursive: true })
  const 事实 = Array.from({ length: 503 }, (_, i) => ({
    编号: `fact-${i + 1}`,
    时间: `2026-10-${String((i % 28) + 1).padStart(2, '0')} 10:00`,
    类别: '事实',
    内容: `第 ${i + 1} 条事实`,
    来源: '她',
    对话: 'dialog-1',
  }))
  const 经历 = [{ 编号: 'event-1', 时间: '2026-10-11 11:00', 类别: '经历', 内容: '一起完成导出测试', 来源: '她' }]
  const 小本子 = [{ 编号: 'note-1', 时间: '2026-10-11 12:00', 类别: '小本子', 内容: '记得复查导出内容', 来源: '我', 修改于: '2026-10-11 12:30', 修改来源: '我' }]
  fs.writeFileSync(path.join(记忆目录, '事实.json'), JSON.stringify(事实), 'utf8')
  fs.writeFileSync(path.join(记忆目录, '经历.json'), JSON.stringify(经历), 'utf8')
  fs.writeFileSync(path.join(记忆目录, '小本子.json'), JSON.stringify(小本子), 'utf8')
  fs.mkdirSync(path.join(记忆目录, '聊天记录'), { recursive: true })
  fs.writeFileSync(path.join(记忆目录, '聊天记录', '对话索引.json'), JSON.stringify([{ 编号: 'dialog-1', 标题: '导出来源' }]), 'utf8')
  fs.writeFileSync(path.join(记忆目录, '聊天记录', '聊天记录.jsonl'), '{"内容":"不该进入导出"}\n', 'utf8')

  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 界面 = 记忆.列长期记忆()
  const 完整 = 记忆.全部长期记忆()
  检查('界面仍最多显示 500 条', 界面.列表.length === 500 && 界面.截断)
  检查('完整导出不受界面上限影响', 完整.length === 505)
  检查('导出数据带来源会话标题', 完整.find((一) => 一.编号 === 'fact-1').会话标题 === '导出来源')
  检查('导出数据保留修改信息', 完整.find((一) => 一.编号 === 'note-1').修改来源 === '我')

  const { 创建长期记忆导出 } = require(path.join(项目根, 'main', 'memory-export.cjs'))
  const 目标 = path.join(临时根, '长期记忆.zip')
  const 果 = 创建长期记忆导出({ 目标文件: 目标, 记录们: 完整, 现在: new Date('2026-10-11T04:00:00.000Z') })
  检查('成功生成 zip', fs.existsSync(目标) && 果.条数 === 505 && 果.压缩字节 > 0)

  const zip = new AdmZip(目标)
  const 名字们 = zip.getEntries().map((一) => 一.entryName).sort()
  检查('压缩包只含三份说明和记忆文件', JSON.stringify(名字们) === JSON.stringify(['说明.txt', '长期记忆.json', '长期记忆.md']))
  const json = JSON.parse(zip.readAsText('长期记忆.json'))
  const md = zip.readAsText('长期记忆.md')
  const 说明 = zip.readAsText('说明.txt')
  检查('JSON 标记格式版本和固定导出时间', json.格式版本 === 2 && json.导出时间 === '2026-10-11T04:00:00.000Z')
  检查('旧记录导出时补齐记忆类型与人物元数据', json.长期记忆.every((一) => 一.记忆类型 && 一.元数据 && 一.元数据.person && 一.元数据.relationship))
  检查('JSON 导出也不暴露第三方机器称呼', json.长期记忆.every((一) => !/用户本人|用户与爱莉希雅/.test(JSON.stringify(一))))
  检查('Markdown 以她的视角明示类型、人物、关系和记录缘由', md.includes('- 记忆类型：semantic') && md.includes('- 关于谁：你') && md.includes('- 关系：你本人') && !md.includes('用户本人') && md.includes('- 记录缘由：'))
  检查('JSON 完整包含 505 条', json.总数 === 505 && json.长期记忆.length === 505)
  检查('Markdown 按三类输出', md.includes('## 事实（503）') && md.includes('## 经历（1）') && md.includes('## 小本子（1）'))
  检查('缺少来源时诚实显示未记录', md.includes('- 来源会话：未记录'))
  检查('说明明确排除敏感和额外数据', /不包含.*聊天记录.*API Key.*本机文件路径/s.test(说明))
  检查('压缩包没有聊天记录内容', !zip.getEntries().some((一) => zip.readAsText(一).includes('不该进入导出')))
  检查('压缩包不泄露临时目录路径', !zip.getEntries().some((一) => zip.readAsText(一).includes(临时根)))

  const 主进程 = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const 预载 = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const 前端 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('主进程校验调用来源并弹保存框', 主进程.includes("ipcMain.handle('导出长期记忆'") && 主进程.includes('确认来自聊天窗口(事件)') && 主进程.includes("title: '导出爱莉希雅的长期记忆'"))
  检查('预载只暴露无参数导出入口', 预载.includes("导出长期记忆: () => ipcRenderer.invoke('导出长期记忆')"))
  检查('记忆页有导出全部按钮', html.includes('id="记忆导出"') && html.includes('>导出全部</button>'))
  检查('取消保存不会显示失败', 前端.includes("else if (!(果 && 果.取消了))"))
  检查('导出时按钮会禁用以防重复', 前端.includes('记忆导出.disabled = true') && 前端.includes('记忆导出.disabled = false'))

  console.log(`\n记忆导出：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => {
    console.error(错误.stack || 错误.message)
    process.exitCode = 1
  })
  .finally(() => {
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ }
  })
