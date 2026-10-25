/** C-14隔离回归：虚构身份、fake处理器及独立临时目录；不加载配置/记忆/正式核心。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { 创建渠道权限, 创建渠道权限守卫 } = require('../脑/渠道权限.cjs')
const { 创建渠道会话映射, 创建渠道会话路由 } = require('../脑/渠道会话映射.cjs')
const { 创建假渠道适配器 } = require('../脑/假渠道适配器.cjs')
const 样例 = require('./fixtures/渠道契约-v1.json')
const 拷贝 = (值) => JSON.parse(JSON.stringify(值))
const 端点 = { 渠道: 'fake', 账号: 'local-fixture' }
const 接收 = (改 = {}) => ({ ...拷贝(样例.本人私聊), 端点: 拷贝(端点), ...改 })
const 第二条 = () => 接收({ 会话: { 类型: 'private', 编号: 'dm-second' }, 发送者编号: 'person-second' })
const 绑定于 = (消息) => ({ 端点: 拷贝(消息.端点), 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false })
const 现在 = () => new Date('2026-10-25T05:00:10.000Z')
const 策略 = (消息们 = [接收()], 改 = {}) => 创建渠道权限({ 绑定: 消息们.map(绑定于), 取现在: 现在, ...改 })
const 许可 = (权限, 消息) => ({ 回复许可: 权限.审查接收(消息).回复许可 })
const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-channel-map-'))
const 文件于 = (名) => path.join(根, 名, '渠道会话映射.json')
let 总数 = 0
async function 检查(说明, 执行) { await 执行(); 总数++; console.log('✓ ' + 说明) }
function 建图(改 = {}, 消息们 = [接收()]) {
  const 权限 = 策略(消息们), 映射 = 创建渠道会话映射({ 权限, ...改 })
  return { 权限, 映射, 解析: (消息 = 接收()) => 映射.解析接收(消息, 许可(权限, 消息)) }
}
function 组合(改 = {}) {
  const 一 = 建图(改, [接收(), 第二条()]), 适配器 = 创建假渠道适配器({ 取现在: 现在 })
  const 守卫 = 创建渠道权限守卫({ 适配器, 权限: 一.权限, 取现在: 现在 })
  const 路由 = 创建渠道会话路由({ 守卫, 映射: 一.映射 })
  return { ...一, 适配器, 守卫, 路由 }
}
function 存档条(编号 = 'channel-fixture') {
  const 消息 = 接收()
  return { 端点: 消息.端点, 会话: 消息.会话, 发送者编号: 消息.发送者编号, 内部对话编号: 编号 }
}
function 造存档(文件, 数据) {
  fs.mkdirSync(path.dirname(文件), { recursive: true })
  fs.writeFileSync(文件, typeof 数据 === 'string' ? 数据 : JSON.stringify(数据), 'utf8')
}

async function main() {
  await 检查('同一地址的新消息与正文变化复用内部对话编号', () => {
    const 一 = 建图(), 首 = 一.解析()
    const 后 = 一.解析(接收({ 消息编号: 'incoming-next', 正文: '另一句话。' }))
    assert.equal(首.新建, true); assert.equal(后.新建, false)
    assert.equal(首.内部对话编号, 后.内部对话编号)
    assert.match(首.内部对话编号, /^channel-[0-9a-f-]+$/u)
  })
  await 检查('已批准虚构身份的不同渠道、账号、会话分别隔离', () => {
    const 消息们 = [接收(), 接收({ 端点: { ...端点, 渠道: 'qq' } }), 接收({ 端点: { ...端点, 账号: 'second-bot' } }), 接收({ 会话: { 类型: 'private', 编号: 'second-dm' } })]
    const 一 = 建图({}, 消息们), 编号们 = 消息们.map((消息) => 一.解析(消息).内部对话编号)
    assert.equal(new Set(编号们).size, 消息们.length)
  })
  await 检查('即使管理员换绑同一会话的本人编号，也不沿用前一身份的对话', () => {
    const 一 = 建图(), 旧 = 一.解析()
    const 新消息 = 接收({ 发送者编号: 'person-other' })
    一.权限.更新绑定([绑定于(新消息)])
    const 新 = 一.解析(新消息)
    assert.equal(新.好, true); assert.notEqual(旧.内部对话编号, 新.内部对话编号)
    assert.equal(一.解析().错误代码, 'FORBIDDEN')
  })
  await 检查('编号中的前导零保留，不与数值相似会话合并', () => {
    const 消息们 = ['001', '1'].map((编号) => 接收({ 会话: { 类型: 'private', 编号 } }))
    const 一 = 建图({}, 消息们)
    assert.notEqual(一.解析(消息们[0]).内部对话编号, 一.解析(消息们[1]).内部对话编号)
  })
  await 检查('仅查询不存在的地址不会创建映射或目录', () => {
    const 文件 = 文件于('lookup'), 一 = 建图({ 文件 })
    assert.deepEqual(一.映射.查询接收(接收(), 许可(一.权限, 接收())), { 好: true, 存在: false, 内部对话编号: null, 新建: false })
    assert.equal(fs.existsSync(path.dirname(文件)), false)
  })
  await 检查('未带许可、伪造、复制及跨策略许可均不能分配', () => {
    const 一 = 建图(), 消息 = 接收(), 真许可 = 许可(一.权限, 消息)
    for (const 上下文 of [{}, { 回复许可: {} }, 拷贝(真许可), 许可(策略(), 消息)]) {
      assert.deepEqual(一.映射.解析接收(消息, 上下文), { 好: false, 错误代码: 'FORBIDDEN' })
    }
    assert.equal(一.映射.核对接收许可, undefined)
    assert.equal(一.解析().新建, true)
  })
  await 检查('许可不能换成其他来源消息或已绑定地址', () => {
    const 一 = 建图({}, [接收(), 第二条()]), 上下文 = 许可(一.权限, 接收())
    for (const 消息 of [接收({ 消息编号: 'different-message' }), 第二条()]) {
      assert.equal(一.映射.解析接收(消息, 上下文).错误代码, 'FORBIDDEN')
    }
    assert.equal(一.解析(第二条()).新建, true)
  })
  await 检查('陌生人、群聊、自报权限和内部编号在存储访问前拒绝', () => {
    const 文件 = 文件于('denied'), 一 = 建图({ 文件 }), 上下文 = 许可(一.权限, 接收())
    for (const 消息 of [接收({ 发送者编号: 'stranger' }), 接收({ 会话: { 类型: 'group', 编号: 'dm-fixture' } }), 接收({ 是本人: true }), 接收({ 内部对话编号: 'channel-injected' })]) {
      assert.equal(一.映射.解析接收(消息, 上下文).好, false)
    }
    assert.equal(fs.existsSync(path.dirname(文件)), false)
  })
  await 检查('绑定撤销、许可过期或时钟倒退时不能查询已有编号', () => {
    let 毫秒 = 现在().getTime()
    const 权限 = 策略([接收()], { 回复许可毫秒: 10, 取现在: () => new Date(毫秒) })
    const 映射 = 创建渠道会话映射({ 权限 }), 上下文 = 许可(权限, 接收())
    assert.equal(映射.解析接收(接收(), 上下文).好, true)
    毫秒 += 10; assert.equal(映射.查询接收(接收(), 上下文).错误代码, 'FORBIDDEN')
    毫秒 -= 11; assert.equal(映射.查询接收(接收(), 上下文).错误代码, 'FORBIDDEN')
    毫秒 += 1; 权限.更新绑定([])
    assert.equal(映射.查询接收(接收(), 上下文).错误代码, 'FORBIDDEN')
  })
  await 检查('撤权不删旧映射，显式重新批准后复用编号，旧许可仍失效', () => {
    const 一 = 建图(), 旧许可 = 许可(一.权限, 接收()), 首 = 一.映射.解析接收(接收(), 旧许可)
    一.权限.更新绑定([]); 一.权限.更新绑定([绑定于(接收())])
    assert.equal(一.映射.解析接收(接收(), 旧许可).错误代码, 'FORBIDDEN')
    assert.equal(一.解析().内部对话编号, 首.内部对话编号)
  })
  await 检查('结果对象被修改不改变内部映射', () => {
    const 一 = 建图(), 首 = 一.解析(), 编号 = 首.内部对话编号
    首.内部对话编号 = 'channel-injected'
    assert.equal(一.解析().内部对话编号, 编号)
  })
  await 检查('显式文件可在关闭和新策略新实例后恢复相同编号', () => {
    const 文件 = 文件于('restart'), 一 = 建图({ 文件 }), 首 = 一.解析()
    一.映射.关闭(); 一.权限.关闭()
    const 二 = 建图({ 文件 }), 后 = 二.解析()
    assert.equal(后.好, true); assert.equal(后.新建, false); assert.equal(后.内部对话编号, 首.内部对话编号)
  })
  await 检查('新Node进程从同一隔离存档恢复编号，不依赖父进程内存', () => {
    const 文件 = 文件于('new-process'), 一 = 建图({ 文件 }), 首 = 一.解析()
    一.映射.关闭(); 一.权限.关闭()
    const 脚本 = `
      const { 创建渠道会话映射 } = require(process.argv[1]);
      const { 创建渠道权限 } = require(process.argv[2]);
      const 消息 = JSON.parse(JSON.stringify(require(process.argv[3]).本人私聊));
      消息.端点 = { 渠道: 'fake', 账号: 'local-fixture' };
      const 权限 = 创建渠道权限({ 绑定: [{ 端点: 消息.端点, 本人编号: 消息.发送者编号, 私聊会话编号: 消息.会话.编号, 允许主动发送: false }] });
      const 映射 = 创建渠道会话映射({ 权限, 文件: process.argv[4] });
      const 果 = 映射.解析接收(消息, { 回复许可: 权限.审查接收(消息).回复许可 });
      process.stdout.write(JSON.stringify(果));
    `
    const 后 = JSON.parse(execFileSync(process.execPath, ['-e', 脚本, path.resolve(__dirname, '../脑/渠道会话映射.cjs'), path.resolve(__dirname, '../脑/渠道权限.cjs'), path.resolve(__dirname, 'fixtures/渠道契约-v1.json'), 文件], { encoding: 'utf8', timeout: 2000, windowsHide: true }))
    assert.equal(后.好, true); assert.equal(后.新建, false); assert.equal(后.内部对话编号, 首.内部对话编号)
  })
  await 检查('存档只含地址与内部编号，没有正文、附件、消息编号、许可或凭据', () => {
    const 文件 = 文件于('metadata'), 一 = 建图({ 文件 })
    assert.equal(一.解析(接收({ 正文: 'BODY-SENTINEL' })).好, true)
    const 原文 = fs.readFileSync(文件, 'utf8'), 数据 = JSON.parse(原文)
    assert.deepEqual(Object.keys(数据).sort(), ['版本', '记录'].sort())
    assert.deepEqual(Object.keys(数据.记录[0]).sort(), ['端点', '会话', '发送者编号', '内部对话编号'].sort())
    for (const 禁 of ['BODY-SENTINEL', 'incoming-001', '正文', '附件', '回复许可', 'apiKey']) assert(!原文.includes(禁))
  })
  await 检查('两个映射实例交错写入不会覆盖对方记录', () => {
    const 文件 = 文件于('two-instances'), 一 = 建图({ 文件 }, [接收(), 第二条()]), 二 = 建图({ 文件 }, [接收(), 第二条()])
    const 首 = 一.解析(), 后 = 二.解析(第二条())
    assert.equal(二.解析().内部对话编号, 首.内部对话编号)
    assert.equal(一.解析(第二条()).内部对话编号, 后.内部对话编号)
    assert.equal(JSON.parse(fs.readFileSync(文件, 'utf8')).记录.length, 2)
  })
  await 检查('同时到达的相同地址只分配一次，但本步不冒充消息去重', async () => {
    const 一 = 组合(), 编号们 = []
    一.路由.订阅接收(async (_, 上下文) => { await Promise.resolve(); 编号们.push(上下文.内部对话编号) })
    const 结果们 = await Promise.all([一.适配器.注入接收(接收()), 一.适配器.注入接收(接收())])
    assert(结果们.every((果) => 果.好)); assert.equal(编号们.length, 2); assert.equal(new Set(编号们).size, 1)
    一.路由.关闭(); 一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('损坏、空、未来版本、重复地址和重复内部编号均拒绝且原文不变', () => {
    const 首 = 存档条(), 二 = { ...拷贝(首), 会话: { 类型: 'private', 编号: 'another' } }
    const 坏们 = ['', '{bad', { 版本: 2, 记录: [] }, { 版本: 1, 记录: [首, 首] }, { 版本: 1, 记录: [首, 二] }, { 版本: 1, 记录: [{ ...首, 内部对话编号: '../desktop' }] }, { 版本: 1, 记录: [{ ...首, 密钥: 'KEY-SENTINEL' }] }]
    for (const [i, 坏] of 坏们.entries()) {
      const 文件 = 文件于('corrupt-' + i); 造存档(文件, 坏)
      const 原文 = fs.readFileSync(文件, 'utf8'), 一 = 建图({ 文件 }), 果 = 一.解析()
      assert.deepEqual(果, { 好: false, 错误代码: 'STORE_CORRUPT' })
      assert.equal(fs.readFileSync(文件, 'utf8'), 原文)
      assert(!JSON.stringify(果).includes(根)); assert(!JSON.stringify(果).includes('SENTINEL'))
    }
  })
  await 检查('有锁时拒绝新分配，不删除别人的锁；已提交映射仍可只读', () => {
    const 文件 = 文件于('locked'), 一 = 建图({ 文件 }, [接收(), 第二条()]), 首 = 一.解析()
    fs.writeFileSync(文件 + '.lock', 'OTHER-OWNER', 'utf8')
    const 原文 = fs.readFileSync(文件, 'utf8')
    assert.equal(一.解析(第二条()).错误代码, 'STORE_BUSY')
    assert.equal(一.解析().内部对话编号, 首.内部对话编号)
    assert.equal(fs.readFileSync(文件 + '.lock', 'utf8'), 'OTHER-OWNER')
    assert.equal(fs.readFileSync(文件, 'utf8'), 原文)
    fs.unlinkSync(文件 + '.lock'); assert.equal(一.解析(第二条()).好, true)
  })
  await 检查('原子替换失败保留旧档并清理自己创建的临时文件和锁', () => {
    const 文件 = 文件于('write-fail'), 一 = 建图({ 文件 }, [接收(), 第二条()]); 一.解析()
    const 原文 = fs.readFileSync(文件, 'utf8'), 原函数 = fs.renameSync
    try {
      fs.renameSync = (从, 到) => { if (到 === 文件) throw new Error('SECRET-RAW-PATH'); return 原函数(从, 到) }
      assert.deepEqual(一.解析(第二条()), { 好: false, 错误代码: 'STORE_WRITE_FAILED' })
    } finally { fs.renameSync = 原函数 }
    assert.equal(fs.readFileSync(文件, 'utf8'), 原文)
    assert.deepEqual(fs.readdirSync(path.dirname(文件)), [path.basename(文件)])
    assert.equal(一.解析(第二条()).好, true)
  })
  await 检查('已经见过的存档消失时不当成空表重建', () => {
    const 文件 = 文件于('missing'), 一 = 建图({ 文件 }); 一.解析()
    fs.unlinkSync(文件)
    assert.deepEqual(一.解析(), { 好: false, 错误代码: 'STORE_UNAVAILABLE' })
    assert.equal(fs.existsSync(文件), false)
  })
  await 检查('路径不可写或存档实际为目录时返回固定错误', () => {
    const 父 = path.join(根, 'file-as-parent'); fs.writeFileSync(父, 'sentinel', 'utf8')
    const 一 = 建图({ 文件: path.join(父, 'map.json') })
    assert.equal(一.解析().好, false); assert.equal(fs.readFileSync(父, 'utf8'), 'sentinel')
    const 文件 = 文件于('directory'); fs.mkdirSync(文件, { recursive: true })
    assert.equal(建图({ 文件 }).解析().好, false)
  })
  await 检查('超大文件拒绝读取和覆盖', () => {
    const 文件 = 文件于('oversize'); 造存档(文件, 'x'.repeat(8 * 1024 * 1024 + 1))
    assert.equal(建图({ 文件 }).解析().错误代码, 'STORE_CORRUPT')
    assert.equal(fs.statSync(文件).size, 8 * 1024 * 1024 + 1)
  })
  await 检查('编号碰撞不能让两个地址合并或改写旧编号', () => {
    const 一 = 建图({ 生成编号: () => 'channel-collision' }, [接收(), 第二条()])
    assert.equal(一.解析().好, true)
    assert.equal(一.解析(第二条()).错误代码, 'ID_CONFLICT')
    assert.equal(一.解析().内部对话编号, 'channel-collision')
  })
  await 检查('编号生成器不能注入桌面对话、路径或带换行的编号', () => {
    for (const 编号 of ['desktop-current', '../chat', 'channel-line\n', 'channel-line\r', null]) {
      const 一 = 建图({ 生成编号: () => 编号 })
      assert.equal(一.解析().错误代码, 'ID_CONFLICT')
    }
  })
  await 检查('映射容量耗尽仍可复用已有编号，不能新增', () => {
    const 一 = 建图({ 最大记录数: 1 }, [接收(), 第二条()]), 首 = 一.解析()
    assert.equal(一.解析(第二条()).错误代码, 'MAP_FULL')
    assert.equal(一.解析().内部对话编号, 首.内部对话编号)
  })
  await 检查('无许可时不会探测或暴露损坏存档', () => {
    const 文件 = 文件于('no-probe'); 造存档(文件, 'SECRET-BROKEN')
    const 一 = 建图({ 文件 })
    assert.deepEqual(一.映射.查询接收(接收()), { 好: false, 错误代码: 'FORBIDDEN' })
    assert.equal(fs.readFileSync(文件, 'utf8'), 'SECRET-BROKEN')
  })
  await 检查('路由处理函数仅收到冻结的内部编号上下文，陌生人与群聊不进入', async () => {
    const 一 = 组合(), 收到们 = []
    一.路由.订阅接收((消息, 上下文) => { assert(Object.isFrozen(上下文)); 收到们.push([消息.发送者编号, 上下文.内部对话编号]) })
    for (const 消息 of [接收(), 第二条(), 接收({ 发送者编号: 'stranger' }), 接收({ 会话: { 类型: 'group', 编号: 'dm-fixture' } })]) await 一.适配器.注入接收(消息)
    assert.equal(收到们.length, 2); assert.notEqual(收到们[0][1], 收到们[1][1])
    一.路由.关闭(); 一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('并行异步处理按捕获编号读写假历史，完成顺序相反也不串上下文', async () => {
    const 一 = 组合(), 历史们 = new Map(), 上下文们 = [], 完成们 = []
    let 放行首, 放行二
    const 等首 = new Promise((好) => { 放行首 = 好 }), 等二 = new Promise((好) => { 放行二 = 好 })
    一.路由.订阅接收(async (消息, 上下文) => {
      const 编号 = 上下文.内部对话编号
      const 原历史 = 历史们.get(编号) || []; 历史们.set(编号, [...原历史, 消息.正文])
      上下文们.push({ 消息, 上下文 })
      await (消息.发送者编号 === 'person-fixture' ? 等首 : 等二)
      历史们.get(编号).push('reply:' + 消息.正文); 完成们.push(消息.发送者编号)
    })
    const 首消息 = 接收({ 正文: 'first-only' }), 二消息 = 第二条(); 二消息.正文 = 'second-only'
    const 首任务 = 一.适配器.注入接收(首消息), 二任务 = 一.适配器.注入接收(二消息)
    放行二(); await 二任务; 放行首(); await 首任务
    assert.deepEqual(完成们, ['person-second', 'person-fixture'])
    assert.deepEqual(历史们.get(上下文们[0].上下文.内部对话编号), ['first-only', 'reply:first-only'])
    assert.deepEqual(历史们.get(上下文们[1].上下文.内部对话编号), ['second-only', 'reply:second-only'])
    for (const { 消息, 上下文 } of 上下文们) {
      const 请求 = { ...拷贝(样例.普通回复), 端点: 消息.端点, 会话: 消息.会话, 接收者编号: 消息.发送者编号, 回复消息编号: 消息.消息编号, 请求编号: 'reply-' + 消息.发送者编号 }
      assert.equal((await 一.守卫.发送(请求, 上下文)).状态, 'sent')
      const 换目标 = { ...请求, 会话: 第二条().会话, 接收者编号: 第二条().发送者编号 }
      if (消息.发送者编号 === 'person-fixture') assert.equal((await 一.守卫.发送(换目标, 上下文)).错误代码, 'FORBIDDEN')
    }
    一.路由.关闭(); 一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('存储失败不调用核心，fake返回处理失败而非成功造新会话', async () => {
    const 文件 = 文件于('router-corrupt'); 造存档(文件, '{broken')
    const 一 = 组合({ 文件 }); let 核心次数 = 0
    一.路由.订阅接收(() => { 核心次数++ })
    const 果 = await 一.适配器.注入接收(接收())
    assert.equal(果.好, false); assert.equal(核心次数, 0)
    assert.equal(fs.readFileSync(文件, 'utf8'), '{broken')
    一.路由.关闭(); 一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('不同权限实例的守卫与映射不能混接', async () => {
    const 一 = 组合(), 另 = 建图(), 路由 = 创建渠道会话路由({ 守卫: 一.守卫, 映射: 另.映射 }); let 次数 = 0
    路由.订阅接收(() => { 次数++ })
    await 一.适配器.注入接收(接收()); assert.equal(次数, 0)
    路由.关闭(); 一.路由.关闭(); 一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('路由退订和关闭不会关闭共享适配器、权限或映射', async () => {
    const 一 = 组合(); let 次数 = 0
    const 退出 = 一.路由.订阅接收(() => { 次数++ })
    await 一.适配器.注入接收(接收()); 退出(); 退出(); 一.路由.关闭(); 一.路由.关闭()
    await 一.适配器.注入接收(接收()); assert.equal(次数, 1)
    assert.equal(一.权限.取状态().已关闭, false); assert.equal(一.映射.取状态().已关闭, false)
    assert.equal(一.适配器.取观测().已关闭, false)
    assert.throws(() => 一.路由.订阅接收(() => {}), /CHANNEL_ROUTER_HANDLER_INVALID/u)
    一.守卫.关闭(); 一.适配器.关闭()
  })
  await 检查('映射关闭后拒绝查询与分配，不删除已保存文件', () => {
    const 文件 = 文件于('closed'), 一 = 建图({ 文件 }); 一.解析()
    const 原文 = fs.readFileSync(文件, 'utf8'); 一.映射.关闭(); 一.映射.关闭()
    assert.equal(一.解析().错误代码, 'MAP_CLOSED')
    assert.equal(一.映射.查询接收(接收(), 许可(一.权限, 接收())).错误代码, 'MAP_CLOSED')
    assert.equal(fs.readFileSync(文件, 'utf8'), 原文)
  })
  await 检查('构造参数受限，路径不能由相对工作目录决定', () => {
    const 权限 = 策略()
    assert.throws(() => 创建渠道会话映射(), /POLICY_INVALID/u)
    for (const 文件 of ['', 'relative.json', path.join(根, 'map.txt'), 7]) assert.throws(() => 创建渠道会话映射({ 权限, 文件 }), /FILE_INVALID/u)
    for (const 最大记录数 of [0, 4097, 1.5]) assert.throws(() => 创建渠道会话映射({ 权限, 最大记录数 }), /OPTIONS_INVALID/u)
    assert.throws(() => 创建渠道会话路由({}), /ROUTER_INVALID/u)
  })
  await 检查('隔离链没有载入配置、正式记忆或桌面主进程模块', () => {
    const 禁止模块 = new Set(['配置.cjs', '记忆.cjs', '主进程.cjs'])
    assert.equal(Object.keys(require.cache).some((文件) => 禁止模块.has(path.basename(文件))), false)
  })
  console.log(`\n渠道会话映射：${总数}/${总数}通过（虚构身份、隔离文件与假核心，无生产接线）`)
}

const 看门狗 = setTimeout(() => { console.error('C14_TEST_TIMEOUT'); process.exit(1) }, 5000)
main().catch(() => { console.error('C14_TEST_FAILED'); process.exitCode = 1 }).finally(() => {
  clearTimeout(看门狗)
  // 只清理本脚本创建的、确认位于系统临时目录内的独立根目录。
  const 临时根 = path.resolve(os.tmpdir()) + path.sep, 目标 = path.resolve(根)
  if (!目标.startsWith(临时根) || !path.basename(目标).startsWith('elysia-channel-map-')) throw new Error('C14_CLEANUP_PATH_INVALID')
  fs.rmSync(目标, { recursive: true, force: true })
})
