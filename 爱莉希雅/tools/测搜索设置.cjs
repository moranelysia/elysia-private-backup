'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const 根 = path.resolve(__dirname, '..')
const 读 = (文件) => fs.readFileSync(path.join(根, 文件), 'utf8')
const main = 读('main.js')
const preload = 读('preload.js')
const html = 读('renderer/index.html')
const js = 读('renderer/chat.js')
const 配置源 = 读('脑/配置.cjs')
let 数 = 0
function 测(名, 值) { assert.ok(值, 名); 数++; console.log('✓ ' + 名) }

// ── SerpAPI Key 存储（原有约束必须保持）──
测('SerpAPI Key 使用独立加密文件', main.includes("'serpapi-api-key.dat'") && main.includes('创建密钥存储'))
测('完整搜索 Key 只放在主进程环境中', main.includes('ELYSIA_SERPAPI_API_KEY') && !preload.includes('ELYSIA_SERPAPI_API_KEY'))
测('renderer 只能读取遮住后的状态', main.includes('遮住的密钥: 遮住(找到的.钥匙)'))
测('保存、测试、清除都有独立 IPC', ['保存搜索密钥', '测试搜索密钥', '清除搜索密钥'].every((名) => main.includes(`ipcMain.handle('${名}'`)))
测('preload 只暴露窄入口（不含配置文件路径）', ['搜索密钥状态:', '保存搜索密钥:', '测试搜索密钥:', '清除搜索密钥:']
  .every((字) => preload.includes(字)) && !preload.includes('.config.json'))
测('界面不会读回完整 Key', !/搜索密钥状态[^\n]+\.钥匙/.test(js))
测('清除后不会静默回退旧 Bing', js.includes('不会回退到旧 Bing 抓取'))
测('启动时并行加载模型和搜索凭据', main.includes('Promise.all([加载加密密钥(), 加载搜索密钥()])'))

// ── 搜索后端开关（本步新增）──
测('设置页有搜索后端下拉和状态区',
  html.includes('id="搜索供应商"') && html.includes('id="搜索供应商状态"'))
测('下拉里两个后端都在', html.includes('value="deepseek"') && html.includes('value="serpapi"'))
测('设置页说明了 SerpAPI Key 只在选 SerpAPI 时才用到', html.includes('只在上面的后端选到 SerpAPI 时才会用到'))
测('后端切换有独立 IPC',
  main.includes("ipcMain.handle('搜索供应商状态'") && main.includes("ipcMain.handle('设置搜索供应商'"))
测('切换只接受两个已知值', main.includes("['deepseek', 'serpapi'].includes(想要)"))
测('写的是工作区配置里的 searchProvider', main.includes("写工作区配置字段('searchProvider', 想要)"))
测('写配置用 配置.配置文件 而不是硬编码路径', main.includes('const 文件 = 配置.配置文件'))
测('切换后立刻改内存值（不用重启）', main.includes('配置.设搜索供应商(想要)'))
测('preload 只暴露读和设两个入口',
  preload.includes('搜索供应商状态: ()') && preload.includes('设置搜索供应商: (值) =>'))
测('界面下拉挂了 change 监听并调用设置入口',
  js.includes("搜索供应商下拉.addEventListener('change'") && js.includes('window.爱莉.设置搜索供应商('))
测('打开设置时也会刷新后端状态', js.includes('刷新搜索供应商()'))
测('选了 SerpAPI 却没填 Key 会明说', js.includes('还没有填 SerpAPI Key，联网搜索会明确失败'))

// ── 配置层：供应商是运行时可变的 getter ──
测('配置里搜索供应商是 getter', /Object\.defineProperty\(出口, '搜索供应商', \{ get: 当前搜索供应商/.test(配置源))
测('配置暴露了设置入口', 配置源.includes('设搜索供应商,') && 配置源.includes('当前搜索供应商,'))
const 配置 = require(path.join(根, '脑', '配置.cjs'))
const 原来 = 配置.搜索供应商
配置.设搜索供应商('serpapi')
测('运行时切换后读到的就是新值', 配置.搜索供应商 === 'serpapi')
配置.设搜索供应商('')
测('空值回落 deepseek', 配置.搜索供应商 === 'deepseek')
配置.设搜索供应商(原来)

// ── 测试 SerpAPI 那把钥匙时必须显式指定供应商 ──
测('测试搜索 Key 时显式指定 serpapi（否则会拿 SerpAPI 钥匙去问 DeepSeek）',
  main.includes("联网搜索.搜索('SerpAPI official', { 钥匙, 供应商: 'serpapi'"))

console.log(`搜索设置：${数}/${数} 通过`)
