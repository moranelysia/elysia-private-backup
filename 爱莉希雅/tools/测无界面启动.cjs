/** S-12A：配置与真实Node子进程验证；全部数据仅为本脚本的独立临时夹具。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync, spawn } = require('node:child_process')
const { 读取健康配置 } = require('../core/运行配置.cjs')
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-headless-health-'))
const 入口 = path.resolve(__dirname, '启动无界面核心.cjs')
const 审计 = path.resolve(__dirname, 'fixtures/健康启动审计.cjs')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
let 总数 = 0, 夹具数 = 0
function 夹具() {
  const 隔离根 = path.join(根, 'case-' + ++夹具数); fs.mkdirSync(隔离根)
  const 文件 = path.join(隔离根, 'headless.config.json')
  const 配置 = { 版本: 1, 模式: 'health', 隔离根, 工作区: path.join(隔离根, 'workspace'), 角色卡: path.join(隔离根, 'persona.json'), 数据目录: path.join(隔离根, 'data'), 缓存目录: path.join(隔离根, 'cache'), 学习区: path.join(隔离根, 'learning'), 附件目录: path.join(隔离根, 'data', 'attachments'), 纸条目录: path.join(隔离根, 'cache', 'notes'), 进度文件: path.join(隔离根, 'learning', 'progress.md') }
  fs.writeFileSync(path.join(隔离根, '.elysia-isolated-root.json'), JSON.stringify({ 版本: 1, 用途: 'headless-test' }))
  const 写 = (值 = 配置) => fs.writeFileSync(文件, typeof 值 === 'string' ? 值 : JSON.stringify(值), 'utf8')
  写(); return { 隔离根, 文件, 配置, 写 }
}
function 环境(一) {
  const 值 = { ...process.env }
  for (const 名 of Object.keys(值)) if (名.startsWith('ELYSIA_')) delete 值[名]
  值.DEEPSEEK_API_KEY = 'CREDENTIAL-SENTINEL'; 值.HEALTH_AUDIT_ROOT = 一.隔离根
  return 值
}
function 执行(一, 参数 = ['--config', 一.文件, '--once'], input = '', 审计开启 = true) {
  const 果 = spawnSync(process.execPath, [...(审计开启 ? ['--require', 审计] : []), 入口, ...参数], { input, encoding: 'utf8', timeout: 3000, windowsHide: true, env: 环境(一) })
  if (果.error) throw 果.error
  assert(!果.stdout.includes('SENTINEL')); assert(!果.stderr.includes('SENTINEL'))
  return { ...果, 行: 果.stdout.trim().split('\n').filter(Boolean).map((行) => JSON.parse(行)) }
}
async function 检查(说明, 做) { await 做(); 总数++; console.log('✓ ' + 说明) }
const 读 = (一, 环境值 = {}) => 读取健康配置(一.文件, { 环境: 环境值 })

async function main() {
  await 检查('合法清单只解析路径，不创建业务目录，返回冻结配置', () => {
    const 一 = 夹具(), 前 = fs.readdirSync(一.隔离根), 果 = 读(一)
    assert(Object.isFrozen(果)); assert.equal(果.模式, 'health'); assert.deepEqual(fs.readdirSync(一.隔离根), 前)
    assert.equal(fs.existsSync(一.配置.数据目录), false)
  })
  await 检查('兼容UTF8 BOM，健康模式无需读取或创建角色卡和学习文件', () => {
    const 一 = 夹具(); 一.写('\uFEFF' + JSON.stringify(一.配置))
    fs.writeFileSync(path.join(一.隔离根, '.elysia-isolated-root.json'), '\uFEFF' + JSON.stringify({ 版本: 1, 用途: 'headless-test' }))
    assert.equal(读(一).模式, 'health'); assert.equal(fs.existsSync(一.配置.角色卡), false); assert.equal(fs.existsSync(一.配置.进度文件), false)
  })
  await 检查('缺失、相对、UNC、错误文件名和不存在的配置拒绝，不回退', () => {
    const 一 = 夹具()
    for (const 文件 of [undefined, 'headless.config.json', '\\\\server\share\headless.config.json', path.join(一.隔离根, 'wrong.json'), path.join(一.隔离根, 'missing', 'headless.config.json')]) assert.throws(() => 读取健康配置(文件, { 环境: {} }), /^Error: HEADLESS_/u)
  })
  await 检查('损坏、空、未来版本、额外密钥和聊天模式清单拒绝', () => {
    const 一 = 夹具()
    for (const 值 of ['', '{broken', { ...一.配置, 版本: 2 }, { ...一.配置, 模式: 'chat' }, { ...一.配置, apiKey: 'CREDENTIAL-SENTINEL' }, { ...一.配置, 数据目录: undefined }]) { 一.写(值); assert.throws(() => 读(一), /HEADLESS_/u) }
  })
  await 检查('超大清单拒绝且不覆盖文件', () => {
    const 一 = 夹具(); 一.写('x'.repeat(16385)); assert.throws(() => 读(一), /HEADLESS_CONFIG_INVALID/u); assert.equal(fs.statSync(一.文件).size, 16385)
  })
  await 检查('根目录必须存在且带专用标记，不接受错用途或未知字段', () => {
    const 一 = 夹具(), 标记 = path.join(一.隔离根, '.elysia-isolated-root.json')
    for (const 值 of [{ 版本: 1, 用途: 'production' }, { 版本: 2, 用途: 'headless-test' }, { 版本: 1, 用途: 'headless-test', 多余: true }]) { fs.writeFileSync(标记, JSON.stringify(值)); assert.throws(() => 读(一), /HEADLESS_/u) }
    fs.unlinkSync(标记); assert.throws(() => 读(一), /HEADLESS_/u)
  })
  await 检查('任何业务路径越界、相对路径或父目录穿越都拒绝', () => {
    const 一 = 夹具()
    for (const 字段 of ['工作区', '角色卡', '数据目录', '缓存目录', '学习区', '附件目录', '纸条目录', '进度文件']) {
      for (const 值 of ['relative', path.join(一.隔离根, '..', 'outside')]) { 一.写({ ...一.配置, [字段]: 值 }); assert.throws(() => 读(一), /HEADLESS_PATH_/u) }
    }
  })
  await 检查('正式工作区、旧副本和祖先目录不允许成为隔离根', () => {
    const 一 = 夹具()
    for (const 隔离根 of ['F:\\elysia', 'F:\\爱莉希雅-副本', 'F:\\']) {
      if (process.platform !== 'win32' || !fs.existsSync(隔离根)) continue
      一.写({ ...一.配置, 隔离根 }); assert.throws(() => 读(一), /HEADLESS_PROTECTED_PATH/u)
    }
  })
  await 检查('目录链接与悬空链接不能将读写目标引到其他位置', () => {
    const 一 = 夹具(), 外 = path.join(根, 'outside-link'); fs.mkdirSync(外)
    const 链 = path.join(一.隔离根, 'link'); fs.symlinkSync(外, 链, process.platform === 'win32' ? 'junction' : 'dir')
    一.写({ ...一.配置, 数据目录: path.join(链, 'data') }); assert.throws(() => 读(一), /HEADLESS_PATH_LINK/u)
    fs.rmdirSync(外); assert.throws(() => 读(一), /HEADLESS_PATH_LINK/u)
  })
  await 检查('隔离根本身为链接时拒绝，不能借父目录别名绕过生产保护', () => {
    const 一 = 夹具(), 链 = path.join(根, 'root-link'); fs.symlinkSync(一.隔离根, 链, process.platform === 'win32' ? 'junction' : 'dir')
    const 配置 = Object.fromEntries(Object.entries(一.配置).map(([键, 值]) => [键, typeof 值 === 'string' && 值.startsWith(一.隔离根) ? 链 + 值.slice(一.隔离根.length) : 值]))
    一.写(配置); assert.throws(() => 读(一), /HEADLESS_PATH_LINK/u)
  })
  await 检查('三类持久根不得重叠，附件纸条进度须放在各自所属目录', () => {
    const 一 = 夹具()
    for (const 改 of [{ 数据目录: 一.隔离根 }, { 缓存目录: 一.配置.数据目录 }, { 学习区: path.join(一.配置.数据目录, 'learning') }, { 附件目录: 一.配置.缓存目录 }, { 纸条目录: 一.配置.学习区 }, { 进度文件: path.join(一.隔离根, 'progress.md') }]) { 一.写({ ...一.配置, ...改 }); assert.throws(() => 读(一), /HEADLESS_LAYOUT_INVALID/u) }
  })
  await 检查('角色卡和配置不能与业务写入目标混用', () => {
    const 一 = 夹具()
    for (const 角色卡 of [一.文件, path.join(一.隔离根, '.elysia-isolated-root.json'), path.join(一.配置.数据目录, 'persona.json')]) { 一.写({ ...一.配置, 角色卡 }); assert.throws(() => 读(一), /HEADLESS_LAYOUT_INVALID/u) }
  })
  await 检查('已有文件不能冒充业务目录，目录不能冒充角色卡', () => {
    const 一 = 夹具(); fs.writeFileSync(一.配置.数据目录, 'sentinel'); assert.throws(() => 读(一), /HEADLESS_PATH_TYPE/u)
    fs.unlinkSync(一.配置.数据目录); 一.写({ ...一.配置, 角色卡: 一.隔离根 }); assert.throws(() => 读(一), /HEADLESS_PATH_TYPE/u)
  })
  await 检查('所有遗留路径环境覆盖必须与本次清单一致，不修改父进程环境', () => {
    const 一 = 夹具(), 对应 = { ELYSIA_WORKSPACE_ROOT: '工作区', ELYSIA_CONFIG_FILE: null, ELYSIA_PERSONA_PATH: '角色卡', ELYSIA_DATA_DIR: '数据目录', ELYSIA_CACHE_DIR: '缓存目录', ELYSIA_学习区: '学习区', ELYSIA_附件目录: '附件目录', ELYSIA_纸条目录: '纸条目录', ELYSIA_进度文件: '进度文件' }
    for (const [变量, 字段] of Object.entries(对应)) {
      assert.equal(读(一, { [变量]: 字段 ? 一.配置[字段] : 一.文件 }).模式, 'health')
      assert.throws(() => 读(一, { [变量]: path.join(一.隔离根, 'wrong') }), /HEADLESS_ENV_CONFLICT/u)
    }
    for (const 环境值 of [{ ELYSIA_USER_DATA_ROOT: 一.隔离根 }, { ELYSIA_USE_USER_DATA: '1' }]) assert.throws(() => 读(一, 环境值), /HEADLESS_ENV_CONFLICT/u)
  })
  await 检查('Windows歧义路径、ADS和设备名拒绝', () => {
    if (process.platform !== 'win32') return
    const 一 = 夹具()
    for (const 字段值 of ['data.', 'data ', 'file:stream', 'CON', 'nul.json']) { 一.写({ ...一.配置, 数据目录: path.join(一.隔离根, 字段值) }); assert.throws(() => 读(一), /HEADLESS_PATH_INVALID/u) }
  })
  await 检查('真实Node单次健康输出固定白名单，无业务导入网络或文件写入', () => {
    const 一 = 夹具(), 前 = fs.readdirSync(一.隔离根), 原文 = fs.readFileSync(一.文件, 'utf8'), 果 = 执行(一)
    assert.equal(果.status, 0); assert.equal(果.stderr.trim(), 'HEALTH_AUDIT_OK')
    assert.deepEqual(果.行, [{ 版本: 1, 模式: 'health', 状态: 'healthy', 业务就绪: false, 模型已加载: false, 渠道已连接: false, 后台任务: 0 }])
    assert(!果.stdout.includes(一.隔离根)); assert.deepEqual(fs.readdirSync(一.隔离根), 前); assert.equal(fs.readFileSync(一.文件, 'utf8'), 原文)
  })
  await 检查('参数错误和缺配置返回固定错误，不能把路径或秘密带进输出', () => {
    const 一 = 夹具()
    for (const 参数 of [[], ['--config'], ['--config', 一.文件, '--chat'], ['--config', 'CREDENTIAL-SENTINEL']]) { const 果 = 执行(一, 参数); assert.equal(果.status, 2); assert.equal(果.行[0].好, false) }
  })
  await 检查('交互健康、拒绝未知命令、关闭后不执行后续命令', () => {
    const 一 = 夹具(), 果 = 执行(一, ['--config', 一.文件], '{"操作":"health"}\n{"操作":"chat","正文":"CREDENTIAL-SENTINEL"}\n{"操作":"shutdown"}\n{"操作":"health"}\n')
    assert.equal(果.status, 0); assert.equal(果.行.length, 4); assert.equal(果.行[2].代码, 'HEALTH_COMMAND_INVALID'); assert.equal(果.行.at(-1).状态, 'stopped')
  })
  await 检查('EOF自然退出，最后一行没有换行也处理，不留常驻任务', () => {
    const 一 = 夹具(), 果 = 执行(一, ['--config', 一.文件], '{"操作":"health"}')
    assert.equal(果.status, 0); assert.deepEqual(果.行.map((条) => 条.状态), ['healthy', 'healthy', 'stopped'])
  })
  await 检查('超长输入有界拒绝并退出，非法JSON不回显原文', () => {
    const 一 = 夹具()
    for (const 输入 of ['x'.repeat(1025), 'x'.repeat(1025) + '\n']) { const 果 = 执行(一, ['--config', 一.文件], 输入); assert.equal(果.status, 2); assert.equal(果.行[1].代码, 'HEALTH_INPUT_TOO_LARGE') }
    const 果 = 执行(一, ['--config', 一.文件], 'CREDENTIAL-SENTINEL\n'); assert.equal(果.行[1].代码, 'HEALTH_COMMAND_INVALID')
  })
  await 检查('分片UTF8中文命令能够完整解码并关闭', async () => {
    const 一 = 夹具(), 子 = spawn(process.execPath, ['--require', 审计, 入口, '--config', 一.文件], { windowsHide: true, env: 环境(一), stdio: ['pipe', 'pipe', 'pipe'] })
    let 输出 = '', 错误 = ''; 子.stdout.on('data', (块) => { 输出 += 块 }); 子.stderr.on('data', (块) => { 错误 += 块 })
    const 结束 = new Promise((好, 坏) => { 子.on('error', 坏); 子.on('close', (码) => { try { assert.equal(码, 0); assert.equal(错误.trim(), 'HEALTH_AUDIT_OK'); assert.equal(输出.trim().split('\n').map(JSON.parse).at(-1).状态, 'stopped'); 好() } catch (错) { 坏(错) } }) })
    const 消息 = Buffer.from('{"操作":"health"}\n{"操作":"shutdown"}\n')
    子.stdin.write(消息.subarray(0, 4)); await new Promise((好) => setImmediate(好)); 子.stdin.end(消息.subarray(4)); await 结束
  })
  await 检查('独立源码目录不把普通父目录误判成整个生产工作区', () => {
    const 一 = 夹具(), 复制根 = path.join(根, 'standalone-source'); fs.mkdirSync(path.join(复制根, 'core'), { recursive: true }); fs.mkdirSync(path.join(复制根, 'tools'))
    fs.copyFileSync(path.resolve(__dirname, '../core/运行配置.cjs'), path.join(复制根, 'core', '运行配置.cjs')); fs.copyFileSync(入口, path.join(复制根, 'tools', '启动无界面核心.cjs'))
    const 果 = spawnSync(process.execPath, [path.join(复制根, 'tools', '启动无界面核心.cjs'), '--config', 一.文件, '--once'], { encoding: 'utf8', timeout: 3000, windowsHide: true, env: 环境(一) })
    assert.equal(果.status, 0); assert.equal(JSON.parse(果.stdout).状态, 'healthy')
  })
  console.log(`\n无界面健康启动：${总数}/${总数}通过（隔离配置、真实Node子进程、无业务接线）`)
}
const 看门狗 = setTimeout(() => { console.error('S12A_TEST_TIMEOUT'); process.exit(1) }, 15000)
main().catch((错) => { console.error('S12A_TEST_FAILED', 错.code || 错.message); process.exitCode = 1 }).finally(() => {
  clearTimeout(看门狗)
  const 目标 = path.resolve(根), 临时根 = path.resolve(os.tmpdir()) + path.sep
  if (!目标.startsWith(临时根) || !path.basename(目标).startsWith('elysia-headless-health-')) throw new Error('S12A_CLEANUP_INVALID')
  fs.rmSync(目标, { recursive: true, force: true })
})
