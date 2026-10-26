'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const 根 = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'elysia-sqlite-F1-'))
process.env.ELYSIA_WORKSPACE_ROOT = 根; process.env.ELYSIA_CONFIG_FILE = path.join(根, 'absent.json'); process.env.ELYSIA_DATA_DIR = path.join(根, 'data'); process.env.ELYSIA_CACHE_DIR = path.join(根, 'cache')
const { 检查只读影子, 创建影子范围, 分类 } = require('../storage/sqlite-shadow.cjs'), { 创建样本库, 创建影子档案 } = require('../storage/sqlite-fixture.cjs')
const { 创建样本包 } = require('./fixtures/sqlite-schema-v1.cjs')
const 测试 = [], 测 = (名, 做) => 测试.push([名, 做]); let n = 0
function 小源() {
  const base = path.join(根, String(++n)), data = path.join(base, 'data'), cache = path.join(base, 'cache'); fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(cache)
  const 文 = '\uFEFF' + JSON.stringify({ 对话: 'legacy', 角色: 'user', 时间: '2026-10-01 19:03', 内容: 'PRIVATE-CONTENT-SENTINEL', 未知: { 缺省: null } }) + '\r\n\r\n'
  fs.mkdirSync(path.join(data, '聊天记录')); fs.writeFileSync(path.join(data, '聊天记录/聊天记录.jsonl'), 文)
  fs.writeFileSync(path.join(data, '聊天记录/对话索引.json'), JSON.stringify([{ 编号: 'legacy', 建于: '2026-10-01 19:03', 模式: '聊天' }]))
  return { base, data, cache, 文, 选项: { 数据目录: data, 缓存目录: cache }, 看: () => 检查只读影子({ 数据目录: data, 缓存目录: cache }, 创建影子范围()) }
}
测('旧聊天无编号/本地时间原文往返，兼容阻断准确且报告无正文', () => {
  const s = 小源(), r = s.看(); assert.equal(r.原文回退一致, true); assert.equal(r.可切换, false); const chat = r.兼容.find((x) => x.来源.endsWith('jsonl')); assert.deepEqual([chat.缺编号, chat.缺轮次, chat.缺序号, chat.非规范UTC时间], [1, 1, 1, 1]); assert.equal(JSON.stringify(r).includes('PRIVATE-CONTENT-SENTINEL'), false); assert.equal(fs.readFileSync(path.join(s.data, '聊天记录/聊天记录.jsonl'), 'utf8'), s.文)
})
测('真实影子入口与synthetic包隔离，不能混用用途', () => {
  const p = 创建样本包(), a = 创建样本库(), b = 创建影子档案(创建影子范围())
  try { assert.throws(() => a.导入({ ...p, 用途: 'local-readonly-shadow' })); assert.throws(() => b.导入(p)); const q = { ...p, 用途: 'local-readonly-shadow' }; b.导入(q); assert.deepEqual(b.导出回退快照({ 用途: 'migration-rollback', 包含私密: true }), q) } finally { a.关闭(); b.关闭() }
})
测('private范围必须明确，getter不执行', () => { const s = 小源(); for (const scope of [undefined, {}, { 用途: 'local-readonly-shadow', 包含私密: false }]) assert.throws(() => 检查只读影子(s.选项, scope)); let ran = false; assert.throws(() => 检查只读影子({ get 数据目录() { ran = true; return s.data }, 缓存目录: s.cache }, 创建影子范围())); assert.equal(ran, false) })
测('未知文件只盘元数据不读正文，阻止完整性通过', () => {
  const s = 小源(), f = path.join(s.data, 'not-registered.txt'); fs.writeFileSync(f, 'UNKNOWN-SENTINEL')
  const 原 = fs.openSync; fs.openSync = function (p, ...a) { assert.notEqual(p, f); return 原.call(this, p, ...a) }
  try { const r = s.看(); assert.ok(r.阻断.includes('UNMAPPED_SOURCE')); assert.equal(JSON.stringify(r).includes('UNKNOWN-SENTINEL'), false) } finally { fs.openSync = 原 }
})
测('历史聊天与附件不重复导入，只给出未核对内容的范围', () => { const s = 小源(); fs.writeFileSync(path.join(s.data, '聊天记录/2026-09-26.jsonl.已并入'), 'not json'); fs.mkdirSync(path.join(s.data, '附件')); fs.writeFileSync(path.join(s.data, '附件/a.bin'), Buffer.from([255])); const r = s.看(); assert.equal(r.原文回退一致, true); assert.equal(r.来源.filter((x) => ['historical', 'external'].includes(x.类型)).length, 2) })
测('cache仅白名单业务来源，素材不扫描', () => { const s = 小源(); fs.mkdirSync(path.join(s.cache, '素材')); fs.writeFileSync(path.join(s.cache, '素材/任意.txt'), 'IGNORE'); assert.equal(s.看().来源.some((x) => x.来源.includes('素材')), false) })
测('读期间源内容变化拒绝，不给一致性报告', () => {
  const s = 小源(), f = path.join(s.data, '聊天记录/聊天记录.jsonl'), 原 = fs.readFileSync; let changed = false
  fs.readFileSync = function (fd, ...a) { const b = 原.call(this, fd, ...a); if (typeof fd === 'number' && !changed) { changed = true; fs.appendFileSync(f, '\n') }; return b }
  try { assert.throws(s.看, { message: 'SQLITE_SHADOW_SOURCE_CHANGED' }) } finally { fs.readFileSync = 原 }
})
测('链接与目录重叠拒绝', () => { const s = 小源(); fs.symlinkSync(s.cache, path.join(s.data, 'linked'), 'junction'); try { assert.throws(s.看, { message: 'SQLITE_SHADOW_LINK_FORBIDDEN' }) } finally { fs.unlinkSync(path.join(s.data, 'linked')) }; assert.throws(() => 检查只读影子({ 数据目录: s.data, 缓存目录: path.join(s.data, '聊天记录') }, 创建影子范围()), { message: 'SQLITE_SHADOW_ROOT_OVERLAP' }) })
测('硬链接拒绝，避免两个来源别名', () => { const s = 小源(); const f = path.join(s.data, '聊天记录/对话索引.json'); fs.linkSync(f, path.join(s.cache, '记忆关系整理状态.json')); assert.throws(s.看, { message: 'SQLITE_SHADOW_FILE_INVALID' }) })
测('无效UTF8、超大来源均拒绝且不截断', () => { const s = 小源(), f = path.join(s.data, '事实.json'); fs.writeFileSync(f, Buffer.from([255])); assert.throws(s.看, { message: 'SQLITE_SHADOW_UTF8_INVALID' }); fs.writeFileSync(f, ' '.repeat(2 * 1024 * 1024 + 1)); assert.throws(s.看, { message: 'SQLITE_SHADOW_LIMIT' }) })
测('重复键档案拒绝，不把错误包算回退成功', () => { const s = 小源(); fs.writeFileSync(path.join(s.data, '事实.json'), '[{"编号":"a","编号":"b"}]'); const r = s.看(); assert.equal(r.原文回退一致, false); assert.equal(r.档案错误, 'SQLITE_FIXTURE_DUPLICATE_KEY'); assert.ok(r.阻断.includes('ARCHIVE_REJECTED')) })
测('检查过程中全部文件写API被禁仍可完成只读盘点', () => { const s = 小源(), keys = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync'], 原 = Object.fromEntries(keys.map((k) => [k, fs[k]])); for (const k of keys) fs[k] = () => assert.fail('WRITE_FORBIDDEN'); try { assert.equal(s.看().原文回退一致, true) } finally { Object.assign(fs, 原) } })
测('来源分类覆盖私密及双端状态，不把未知来源自动吞入', () => { assert.equal(分类('data/日记/私密/2026/2026-10-24.json'), 'private-diary'); assert.equal(分类('data/关系整理状态.json'), 'auxiliary'); assert.equal(分类('cache/记忆关系整理状态.json'), 'auxiliary'); assert.equal(分类('data/钥匙.txt'), 'unmapped') })
测('缺省来源明确列出但不创建空文件', () => { const s = 小源(), r = s.看(); assert.ok(r.未存在的已登记来源.includes('data/事实.json')); assert.equal(fs.existsSync(path.join(s.data, '事实.json')), false) })
;(async () => { let pass = 0; try { for (const [名, 做] of 测试) { try { await 做(); pass++; console.log('PASS ' + 名) } catch (e) { console.error('FAIL ' + 名 + '\n' + e.stack) } }; console.log(`SQLite S-15F1: ${pass}/${测试.length}; readonly diagnostics only`); if (pass !== 测试.length) process.exitCode = 1 } finally { const real = fs.realpathSync(根); assert.equal(path.dirname(real).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase()); assert.ok(path.basename(real).startsWith('elysia-sqlite-F1-')); fs.rmSync(real, { recursive: true, force: true }) } })()
