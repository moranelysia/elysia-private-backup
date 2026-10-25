'use strict'
const assert = require('node:assert/strict')
const { 创建样本库, 表们 } = require('../storage/sqlite-fixture.cjs')
const { 创建样本包 } = require('./fixtures/sqlite-schema-v1.cjs')
const 审计 = { 用途: 'migration-audit' }, 回退 = { 用途: 'migration-rollback', 包含私密: true }
let 通过 = 0, 失败数 = 0
function 测(名, 做) { try { 做(); 通过++; console.log(`PASS ${名}`) } catch { 失败数++; console.error(`FAIL ${名}`) } }
function 用库(做) { const 库 = 创建样本库(); try { return 做(库) } finally { 库.关闭() } }
const 小包 = (类型, 值, 原文) => ({ 版本: 1, 用途: 'synthetic-sqlite-fixture', 文档: [{ 名称: 'single', 类型, 原文: 原文 ?? JSON.stringify(值) }] })
function 拒绝(包, 码) { 用库((库) => { assert.throws(() => 库.导入(包), { message: 码 }); const 状态 = 库.取统计(); assert.equal(状态.文档数, 0); assert.equal(状态.问题数, 0); assert.ok(Object.values(状态.各表).every((n) => n === 0)) }) }
const 样本 = 创建样本包()
测('真实SQLite内存引擎及完整17类业务表', () => 用库((库) => {
  assert.equal(表们.length, 17); assert.equal(库.取统计().内存库, true); assert.match(库.取统计().sqlite, /^3\.\d+\.\d+$/u)
  库.导入(样本)
  assert.deepEqual(库.取统计().各表, { conversations: 2, messages: 3, long_memories: 6, temporary_memories: 2, memory_evidence: 3, memory_relations: 2, relation_suppressions: 1, diaries: 3, diary_tasks: 1, private_evaluations: 1, private_deletions: 2, channel_sessions: 2, channel_tasks: 3, channel_logs: 2, usage_events: 3, extraction_buffer: 1, auxiliary_state: 2 })
  assert.equal(库.取统计().文档数, 19); assert.equal(库.取统计().问题数, 3); assert.equal(库.核验().好, true)
}))
测('19份原文逐字节往返：BOM/CRLF/空行/无末换行/emoji', () => 用库((库) => {
  库.导入(样本); const 导出 = 库.导出回退快照(回退)
  assert.deepEqual(导出, 样本)
  for (let i = 0; i < 样本.文档.length; i++) assert.ok(Buffer.from(导出.文档[i].原文).equals(Buffer.from(样本.文档[i].原文)))
}))
测('缺失/null/空串及未知扩展分别保留，不猜编号和会话', () => 用库((库) => {
  库.导入(样本); const 事实 = 库.查看映射('long_memories', 审计).filter((一) => 一.category === '事实')
  const 空 = JSON.parse(事实[2].payload_json), 缺 = JSON.parse(事实[3].payload_json)
  assert.equal(空.编号, ''); assert.equal(空.时间, null); assert.equal(Object.hasOwn(缺, '编号'), false); assert.equal(Object.hasOwn(缺, '时间'), false)
  assert.deepEqual(JSON.parse(事实[0].payload_json).元数据, { 旧空串: '', 旧空值: null, 新字段: ['保留', 7] })
  assert.equal(事实[2].legacy_id, null); assert.equal(事实[3].legacy_id, null)
  assert.equal(库.查看映射('messages', 审计)[2].conversation_id, null)
}))
测('UTC/偏移/本地/未知时间保持原样，不倒推时间线', () => 用库((库) => {
  库.导入(样本); const 行 = 库.查看映射('long_memories', 审计)
  assert.equal(行.find((一) => 一.category === '经历').time_kind, 'utc')
  const 事实 = 行.filter((一) => 一.category === '事实')
  assert.deepEqual(事实.map((一) => 一.time_kind), ['offset', 'local-or-unspecified', 'unknown', 'unknown'])
  assert.equal(事实[0].time_raw, '2026-10-24T20:30:00+08:00'); assert.equal(事实[1].time_raw, '2026-10-24 20:30:00')
  assert.equal(行.find((一) => 一.category === '小本子').time_raw, '时间未记录')
  assert.equal(库.查看映射('messages', 审计)[0].occurred_raw, '2026-10-24T12:29:00Z')
}))
测('60分/逐字证据/历史/归档/晋升引用完整保留', () => 用库((库) => {
  库.导入(样本); const 临时 = 库.查看映射('temporary_memories', 审计), 证据 = 库.查看映射('memory_evidence', 审计)
  assert.equal(JSON.parse(临时[0].ledger_json).当前分数, 60); assert.equal(JSON.parse(临时[0].promotion_json).目标编号, 'fact-01')
  assert.deepEqual(证据.map((一) => [一.parent_ordinal, 一.group_name, 一.evidence_ordinal]), [[0, '证据', 0], [0, '证据', 1], [0, '评估历史', 0]])
  assert.equal(临时[1].lifecycle, '已归档'); assert.equal(JSON.parse(临时[1].payload_json).可复活, true); assert.equal(临时[1].ledger_json, 'null')
}))
测('关系方向/抑制/悬空旧引用保留，不自动补目标', () => 用库((库) => {
  库.导入(样本); const 关系 = 库.查看映射('memory_relations', 审计)
  assert.equal(关系[0].from_id, 'fact-01'); assert.equal(关系[0].to_category, '经历'); assert.equal(关系[1].to_id, '已不存在的旧引用')
  assert.equal(库.查看映射('relation_suppressions', 审计)[0].signature, 'fixture-suppression-01')
}))
测('shared读取排除private正文/来源，旧日记默认shared', () => 用库((库) => {
  库.导入(样本); const 共享 = 库.读取共享日记(), 文 = JSON.stringify(共享)
  assert.deepEqual(共享.map((一) => 一.编号), ['d-edited', 'd-legacy'])
  assert.equal(文.includes('private-source-fixture'), false); assert.equal(文.includes('却只陪你坐'), false)
  assert.ok(共享.every((一) => 一.可见性 === 'shared')); assert.equal(库.查看映射('diaries', 审计).find((一) => 一.legacy_id === 'd-edited').edited, 1)
}))
测('完整私密回退必须显式声明范围，不充当默认导出', () => 用库((库) => {
  库.导入(样本)
  for (const 范围 of [undefined, {}, { 用途: 'migration-rollback' }, { 用途: 'migration-rollback', 包含私密: false }, { 用途: 'share', 包含私密: true }]) assert.throws(() => 库.导出回退快照(范围), { message: 'SQLITE_FIXTURE_EXPORT_SCOPE_REQUIRED' })
  assert.ok(库.导出回退快照(回退).文档.some((一) => 一.类型 === 'private-diary'))
  assert.throws(() => 库.查看映射('diaries'), { message: 'SQLITE_FIXTURE_AUDIT_SCOPE_REQUIRED' })
  assert.throws(() => 库.查看映射('diaries; DROP TABLE diaries', 审计), { message: 'SQLITE_FIXTURE_AUDIT_SCOPE_REQUIRED' })
}))
测('private删除周期/评估完成状态不丢失，不重建', () => 用库((库) => {
  库.导入(样本); assert.deepEqual(库.查看映射('private_deletions', 审计).map((一) => 一.period), ['2026-10-21', '2026-10-22'])
  assert.equal(库.查看映射('private_evaluations', 审计)[0].status, '已生成'); assert.equal(库.查看映射('diary_tasks', 审计)[0].status, '已完成')
}))
测('渠道前导零地址不合并；unknown/processing不重置', () => 用库((库) => {
  库.导入(样本); const 地址 = 库.查看映射('channel_sessions', 审计).map((一) => JSON.parse(一.address_key))
  assert.deepEqual(地址.map((一) => 一[3]), ['001', '1']); assert.ok(地址.every((一) => 一[1] === '0007' && 一[4] === '0003'))
  assert.deepEqual(库.查看映射('channel_tasks', 审计).map((一) => 一.status), ['queued', 'unknown', 'processing'])
  assert.equal(JSON.parse(库.查看映射('channel_tasks', 审计)[1].payload_json).回执.代码, 'DELIVERY_UNKNOWN')
}))
测('用量started/succeeded及持久缓冲来源保留', () => 用库((库) => {
  库.导入(样本); assert.deepEqual(库.查看映射('usage_events', 审计).map((一) => 一.status), [null, 'started', 'succeeded'])
  assert.equal(库.查看映射('usage_events', 审计)[0].request_id, null); assert.equal(JSON.parse(库.查看映射('usage_events', 审计)[0].payload_json).元, 0.00001)
  assert.equal(JSON.parse(库.查看映射('usage_events', 审计)[2].payload_json).总计, 13)
  assert.equal(库.查看映射('extraction_buffer', 审计)[0].message_id, 'msg-009')
}))
测('参数化正文不会成为SQL；统计不含正文或旧编号', () => 用库((库) => {
  库.导入(样本); assert.ok(库.查看映射('messages', 审计)[1].content.includes('DROP TABLE'))
  assert.equal(库.取统计().各表.diaries, 3); assert.equal(JSON.stringify(库.取统计()).includes('chat-001'), false)
}))
测('同一包重复导入幂等，外层属性顺序不影响指纹', () => 用库((库) => {
  const 首次 = 库.导入(样本), 重排 = { 文档: 样本.文档.map((一) => ({ 原文: 一.原文, 类型: 一.类型, 名称: 一.名称 })), 用途: 样本.用途, 版本: 1 }
  assert.equal(首次.新导入, true); assert.deepEqual(库.导入(重排), { 好: true, 新导入: false, 指纹: 首次.指纹 }); assert.equal(库.取统计().文档数, 19)
}))
测('不同包不得覆盖已导入快照；返回副本不可改库', () => 用库((库) => {
  库.导入(样本); const 副本 = 库.导出回退快照(回退); 副本.文档[0].原文 = '[]'
  assert.throws(() => 库.导入(副本), { message: 'SQLITE_FIXTURE_NOT_EMPTY' }); assert.deepEqual(库.导出回退快照(回退), 样本)
  const 行 = 库.查看映射('diaries', 审计); 行[0].visibility = 'private'; assert.equal(库.读取共享日记().length, 2)
}))
测('同类别重复稳定编号触发真实多表事务整体回滚，随后可重试', () => 用库((库) => {
  const 包 = 创建样本包(), 源 = 包.文档.find((一) => 一.类型 === 'facts'), 值 = JSON.parse(源.原文); 值.push({ 编号: 'fact-01', 内容: '冲突' }); 源.原文 = JSON.stringify(值)
  assert.throws(() => 库.导入(包), { message: 'SQLITE_FIXTURE_IMPORT_FAILED' })
  assert.equal(库.取统计().文档数, 0); assert.equal(库.取统计().问题数, 0); assert.ok(Object.values(库.取统计().各表).every((n) => n === 0))
  assert.equal(库.导入(样本).好, true); assert.equal(库.核验().好, true)
}))
测('重复来源名称失败也不残留任何已写表行', () => 用库((库) => {
  const 包 = 创建样本包(); 包.文档[1].名称 = 包.文档[0].名称
  assert.throws(() => 库.导入(包), { message: 'SQLITE_FIXTURE_IMPORT_FAILED' }); assert.equal(库.取统计().文档数, 0)
  assert.ok(Object.values(库.取统计().各表).every((n) => n === 0))
}))
测('日记任务和渠道任务的稳定编号冲突同样整批回滚', () => {
  for (const 类型 of ['diary-index', 'channel-tasks']) 用库((库) => {
    const 包 = 创建样本包(), 源 = 包.文档.find((一) => 一.类型 === 类型), 值 = JSON.parse(源.原文), 列表 = 值[类型 === 'diary-index' ? '任务' : '记录']
    列表.push({ ...列表[0] }); 源.原文 = JSON.stringify(值)
    assert.throws(() => 库.导入(包), { message: 'SQLITE_FIXTURE_IMPORT_FAILED' }); assert.equal(库.取统计().文档数, 0); assert.ok(Object.values(库.取统计().各表).every((n) => n === 0))
  })
})
测('私密过滤依据显式visibility，不依赖来源名称猜测', () => 用库((库) => {
  库.导入(小包('diary', { 格式版本: 1, 编号: 'd-01', 可见性: 'private', 模块: [{ 内容: '留在本机的虚构片段。' }] }))
  assert.deepEqual(库.读取共享日记(), []); assert.equal(库.查看映射('diaries', 审计)[0].visibility, 'private')
}))
测('私密类型缺标记及非法可见性拒绝', () => {
  拒绝(小包('private-diary', { 格式版本: 1, 模块: [] }), 'SQLITE_FIXTURE_VISIBILITY_INVALID')
  for (const 可见性 of ['public', '', null]) 拒绝(小包('diary', { 格式版本: 1, 可见性 }), 'SQLITE_FIXTURE_VISIBILITY_INVALID')
})
测('未知版本与类型不得静默降级', () => {
  拒绝(小包('temporary', { 版本: 2, 记录: [] }), 'SQLITE_FIXTURE_VERSION_UNSUPPORTED')
  拒绝(小包('relations', { 格式版本: 1, 关系: [], 自动抑制: [] }), 'SQLITE_FIXTURE_VERSION_UNSUPPORTED')
  拒绝(小包('not-a-type', {}), 'SQLITE_FIXTURE_TYPE_UNSUPPORTED')
})
测('JSONL坏行不跳过；重复键含转义同名键拒绝', () => {
  拒绝(小包('messages', null, '{"内容":"合法"}\n{"内容":\n'), 'SQLITE_FIXTURE_JSON_INVALID')
  拒绝(小包('auxiliary', null, '{"a":1,"a":2}'), 'SQLITE_FIXTURE_DUPLICATE_KEY')
  拒绝(小包('auxiliary', null, '{"a":1,"\\u0061":2}'), 'SQLITE_FIXTURE_DUPLICATE_KEY')
})
测('不安全整数及无穷数拒绝，不接受有损数值投影', () => {
  拒绝(小包('auxiliary', null, '{"旧编号":9007199254740993}'), 'SQLITE_FIXTURE_NUMBER_UNSAFE')
  拒绝(小包('auxiliary', null, '{"值":1e309}'), 'SQLITE_FIXTURE_NUMBER_UNSAFE')
})
测('数字渠道编号不强转为字符串', () => {
  拒绝(小包('channel-map', { 版本: 1, 记录: [{ 端点: { 渠道: 'fixture', 账号: 7 }, 会话: { 类型: 'direct', 编号: '1' }, 发送者编号: '3', 内部对话编号: 'chat-001' }] }), 'SQLITE_FIXTURE_DATA_INVALID')
})
测('错误结构与非对象记录拒绝', () => {
  拒绝(小包('facts', [null]), 'SQLITE_FIXTURE_DATA_INVALID')
  拒绝(小包('temporary', { 版本: 1, 记录: [{ 评估账本: { 证据: '错误' } }] }), 'SQLITE_FIXTURE_DATA_INVALID')
  拒绝(小包('conversations', [{ 编号: 123 }]), 'SQLITE_FIXTURE_DATA_INVALID')
})
测('必须显式样本范围，拒绝路径式来源和未配对代理项', () => {
  拒绝({ ...样本, 用途: 'production' }, 'SQLITE_FIXTURE_SCOPE_REQUIRED')
  const 路径包 = 小包('facts', []); 路径包.文档[0].名称 = '../facts.json'; 拒绝(路径包, 'SQLITE_FIXTURE_DATA_INVALID')
  const 坏字符 = 小包('auxiliary', null, '{"值":"\uD800"}'); 拒绝(坏字符, 'SQLITE_FIXTURE_DATA_INVALID')
})
测('包的额外字段/getter/稀疏数组一律拒绝，不执行getter', () => {
  拒绝({ ...样本, 路径: 'unused' }, 'SQLITE_FIXTURE_DATA_INVALID')
  let 执行 = false; const 包 = { 版本: 1, 用途: 'synthetic-sqlite-fixture', get 文档() { 执行 = true; return [] } }
  拒绝(包, 'SQLITE_FIXTURE_DATA_INVALID'); assert.equal(执行, false)
  const 稀疏 = { ...样本, 文档: new Array(1) }; 拒绝(稀疏, 'SQLITE_FIXTURE_DATA_INVALID')
})
测('文档/字节/投影行数/深度均有上限', () => {
  拒绝({ ...样本, 文档: [] }, 'SQLITE_FIXTURE_LIMIT')
  拒绝({ ...样本, 文档: Array.from({ length: 65 }, (_, i) => ({ 名称: `d-${i}`, 类型: 'auxiliary', 原文: '{}' })) }, 'SQLITE_FIXTURE_LIMIT')
  拒绝(小包('auxiliary', { 值: 'a'.repeat(2 * 1024 * 1024) }), 'SQLITE_FIXTURE_LIMIT')
  const 包 = { ...样本, 文档: Array.from({ length: 9 }, (_, i) => ({ 名称: `d-${i}`, 类型: 'auxiliary', 原文: JSON.stringify({ 值: 'a'.repeat(1024 * 1024) }) })) }; 拒绝(包, 'SQLITE_FIXTURE_LIMIT')
  const 多行 = { ...样本, 文档: ['a', 'b'].map((名称) => ({ 名称, 类型: 'facts', 原文: JSON.stringify(Array.from({ length: 5001 }, () => ({}))) })) }; 拒绝(多行, 'SQLITE_FIXTURE_LIMIT')
  拒绝(小包('auxiliary', null, '{"值":' + '['.repeat(50) + '0' + ']'.repeat(50) + '}'), 'SQLITE_FIXTURE_LIMIT')
})
测('关闭幂等，关闭后拒绝操作；未导入不得伪报可导出', () => {
  const 库 = 创建样本库(); assert.throws(() => 库.导出回退快照(回退), { message: 'SQLITE_FIXTURE_INTEGRITY_FAILED' }); 库.关闭(); 库.关闭()
  assert.throws(() => 库.取统计(), { message: 'SQLITE_FIXTURE_CLOSED' }); assert.throws(() => 库.导入(样本), { message: 'SQLITE_FIXTURE_CLOSED' })
})
console.log(`SQLite S-15A: ${通过}/${通过 + 失败数}; synthetic only; no disk database`)
if (失败数) process.exitCode = 1
