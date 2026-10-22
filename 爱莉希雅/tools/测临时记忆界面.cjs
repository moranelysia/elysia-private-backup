/** M2 临时记忆管理页与安全晋升：数据使用隔离目录，不启动 Electron。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-short-memory-ui-'))
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
  const 临时模块 = require(path.join(项目根, '脑', '临时记忆.cjs'))
  const 长期库 = require(path.join(项目根, '脑', '记忆.cjs'))
  const { 晋升到长期 } = require(path.join(项目根, '脑', '临时记忆晋升.cjs'))
  let 编号 = 0
  const 临时库 = 临时模块.创建临时记忆库({
    文件: path.join(临时根, '记忆', '临时记忆.json'),
    现在: () => new Date('2026-10-14T10:00:00.000Z'),
    新编号: () => 'ui-' + (++编号),
  })

  const 待确认 = 临时库.新增('候选偏好', '可能喜欢安静的音乐', { 提取方式: '模型提取', 来源对话: 'dialog-a' })
  const 拒绝未确认 = 晋升到长期({ 临时库, 长期库, 编号: 待确认.编号, 去向: '事实' })
  检查('待确认内容不能写入长期层', !拒绝未确认.好 && 长期库.全部长期记忆().length === 0)
  临时库.修改(待确认.编号, { 确认状态: '已确认' })
  const 晋升 = 晋升到长期({ 临时库, 长期库, 编号: 待确认.编号, 去向: '事实' })
  检查('人工确认后可以晋升', 晋升.好 && 晋升.去向 === '事实' && !!晋升.目标编号)
  const 长期 = 长期库.全部长期记忆()
  检查('长期层只新增一条对应事实', 长期.length === 1 && 长期[0].类别 === '事实' && 长期[0].内容 === 待确认.内容)
  检查('长期记录保存原临时编号和来源会话', 长期[0].临时记忆 === 待确认.编号 && 长期[0].对话 === 'dialog-a')
  检查('晋升会完整保留记忆类型和人物元数据', 长期[0].记忆类型 === 待确认.记忆类型 && JSON.stringify(长期[0].元数据) === JSON.stringify(待确认.元数据))
  检查('临时记录进入已晋升状态并保存目标编号', 临时库.取一条(待确认.编号).生命周期 === '已晋升' && 临时库.取一条(待确认.编号).晋升.目标编号 === 晋升.目标编号)
  const 重试 = 晋升到长期({ 临时库, 长期库, 编号: 待确认.编号, 去向: '事实' })
  检查('重复晋升幂等且不会产生重复长期事实', 重试.好 && 重试.没变化 && 长期库.全部长期记忆().length === 1)

  const 另一 = 临时库.新增('近期事件', '一起完成一次测试', { 来源对话: 'dialog-b' })
  临时库.提议晋升(另一.编号, '经历')
  const 换目标 = 晋升到长期({ 临时库, 长期库, 编号: 另一.编号, 去向: '事实' })
  检查('已有待确认提议时不能偷换晋升去向', !换目标.好 && 换目标.说明.includes('经历'))
  检查('非法去向被拒绝', !晋升到长期({ 临时库, 长期库, 编号: 另一.编号, 去向: '工作摘要' }).好)

  const main = fs.readFileSync(path.join(项目根, 'main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(项目根, 'preload.js'), 'utf8')
  const html = fs.readFileSync(path.join(项目根, 'renderer', 'index.html'), 'utf8')
  const js = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  const css = fs.readFileSync(path.join(项目根, 'renderer', 'style.css'), 'utf8')

  检查('主进程提供查询新增修改关系删除恢复晋升入口', [
    '问临时记忆', '新增临时记忆', '修改临时记忆', '处理临时记忆关系', '删除临时记忆', '恢复临时记忆', '晋升临时记忆',
  ].every((名) => main.includes(`ipcMain.handle('${名}'`)))
  检查('主进程限制搜索、正文和标签长度', main.includes("slice(0, 80)") && main.includes("slice(0, 4001)") && main.includes("slice(0, 12)"))
  检查('主进程只把白名单字段交给界面', main.includes('const 列表 = 果.列表.map') && main.includes("目标编号: String(一.晋升"))
  检查('启动和打开列表都会归档到期记录', (main.match(/临时记忆\.归档到期\(\)/g) || []).length >= 2)
  检查('预载层对全部临时记忆参数再次裁剪', preload.includes('问临时记忆:') && preload.includes('新增临时记忆:') && preload.includes("String(请求.内容 || '').slice(0, 4001)"))
  检查('重要性在主进程和预载层都限制为零到三级', main.includes('重要性必须是 0 到 3') && preload.includes('重要性: Number.isInteger'))
  检查('记忆页有长期和临时两个层级', html.includes('data-记忆层="长期"') && html.includes('data-记忆层="临时"'))
  检查('临时层有分类、生命周期和确认状态筛选', ['临时记忆分类', '临时记忆生命周期', '临时记忆确认状态'].every((id) => html.includes(`id="${id}"`)))
  检查('临时层提供手动新增入口', html.includes('id="临时记忆新增"') && js.includes('function 新增临时记忆表单()'))
  检查('临时内容和标签使用 textContent 绘制', js.includes("内容.textContent = 一.内容 || ''") && js.includes('一个.textContent = 名'))
  检查('界面可查看并手动修改重要性', js.includes('function 重要性选择') && js.includes('重要性: Number(重要性.value)') && css.includes('.临时状态.重要性-3'))
  检查('临时与长期界面显示自主评分和可解释依据', main.includes('自主评估: 一.自主评估') && (js.match(/自动评估 \$\{一\.自主评估\.分数\} 分/g) || []).length >= 2)
  检查('待确认项显示动态评估次数、分数和决定', main.includes('评估账本: 一.评估账本') && (js.match(/当前评估 \$\{一\.评估账本\.当前分数\} 分/g) || []).length >= 2)
  检查('手动新增与编辑都能选择三类记忆类型', js.includes('function 记忆类型选择') && js.includes("['episodic', 'semantic', 'procedural']") && js.includes('记忆类型: 记忆类型.value') && preload.includes("安全.记忆类型"))
  检查('上下文账本显示召回总分、分项和选择原因', js.includes('评分：${一.评分') && js.includes('分项：相关') && js.includes('一.选择原因'))
  检查('上下文账本区分关键词、类型、意图和语义分', js.includes('类型 ${一.分项') && js.includes('意图 ${一.分项') && js.includes('语义 ${一.分项'))
  检查('上下文账本显示可解释的时间分、因子和半衰期', js.includes('时间 ${一.分项') && js.includes('时间因子') && js.includes('半衰期天数'))
  检查('主进程只暴露关系白名单和关联摘要', main.includes('状态: String(原关系.状态') && main.includes('关联内容: String(关联条') && !main.includes('关系文件路径'))
  检查('替代关系必须在界面人工二选一', preload.includes('处理临时记忆关系:') && js.includes("做决定('替代旧条')") && js.includes("做决定('两条并存')"))
  检查('界面明确展示待处理与已替代状态', js.includes('可能更正旧记忆') && js.includes('本条保留用于追溯，不再召回') && css.includes('.临时状态.关系-待处理'))
  检查('界面支持确认、晋升、恢复、编辑和删除', ['确认临时记忆', '晋升临时记忆', '恢复临时记忆', '开始编辑临时记忆', '删除临时记忆'].every((词) => js.includes(词)))
  检查('晋升前有明确人工确认', js.includes('把这条临时记忆晋升到') && js.includes('window.confirm'))
  检查('临时层明确说明只有已确认且相关项可用于聊天', js.includes('仅已确认且相关的有效记录可用于聊天'))
  const 对话源码 = fs.readFileSync(path.join(项目根, '脑', '对话.cjs'), 'utf8')
  const 提示词源码 = fs.readFileSync(path.join(项目根, '脑', '提示词.cjs'), 'utf8')
  检查('聊天召回仍由对话层独立接入', 对话源码.includes("require('./临时记忆召回.cjs')") && !提示词源码.includes("require('./临时记忆召回.cjs')"))
  检查('窄窗口下临时筛选改为单列', /@media \(max-width: 560px\)[\s\S]*?\.临时记忆筛选,[\s\S]*?grid-template-columns:\s*1fr/.test(css))
  检查('记忆面板仍限制在窗口高度内滚动', css.includes('height: min(640px, calc(100vh - 36px))') && css.includes('overflow-y: auto'))

  console.log(`\n临时记忆界面：${通过}/${总数} 通过`)
}

main()
  .catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })
  .finally(() => { try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ } })

