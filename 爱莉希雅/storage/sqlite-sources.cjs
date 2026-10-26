/** F3B：来源路径与业务目标的唯一登记；纯规则，不读文件或配置。 */
'use strict'
const 固定状态来源 = Object.freeze({
  'relations:main': ['data/关系图.json', 'relations'],
  'relation-layout:main': ['cache/长期记忆关系图布局.json', 'auxiliary'],
  'diary-index:main': ['data/日记/索引.json', 'diary-index'],
  'extraction-buffer:main': ['cache/后台缓冲.json', 'extraction-buffer'],
  'usage:desktop': ['data/用量.jsonl', 'usage'], 'usage:headless': ['data/核心用量.jsonl', 'usage'],
  'work-index:main': ['data/工作索引.json', 'work-index'],
  'background-state:relations': ['cache/记忆关系整理状态.json', 'auxiliary'],
  'background-state:relations-headless': ['data/关系整理状态.json', 'auxiliary'],
  'cluster-state:clusters': ['cache/记忆聚类候选.json', 'auxiliary'], 'cluster-state:timeline': ['cache/记忆时间线候选.json', 'auxiliary'],
})
const 固定旧档 = Object.freeze({ 'data/聊天记录/对话索引.json': 'conversations', 'data/聊天记录/聊天记录.jsonl': 'messages', 'data/事实.json': 'facts', 'data/经历.json': 'episodes', 'data/小本子.json': 'notebook', 'data/临时记忆.json': 'temporary' })
for (const v of Object.values(固定状态来源)) Object.freeze(v)
function 识别来源(p) {
  if (typeof p !== 'string') return { 去向:'unmapped', 类型:'unmapped' }
  if (p.split('/').some((x)=>['.git','node_modules','__pycache__'].includes(x))) return { 去向:'excluded', 类型:'rebuildable-dependency' }
  if (/(?:^|\/)(?:\.env(?:\..*)?|.*(?:钥匙|api-key|api_key|credential|token|登录态).*|.*\.pem|.*\.key)$/iu.test(p) || p === 'cache/设置.json') return { 去向:'separate-secret', 类型:'metadata-only' }
  if (Object.hasOwn(固定旧档, p)) return { 去向: 'legacy', 类型: 固定旧档[p] }
  for (const [id, [路径, 类型]] of Object.entries(固定状态来源)) if (p === 路径) return { 去向: 'state', 类型, 业务类型: id.split(':')[0], 号: id.split(':')[1] }
  if (p === 'data/日记/私密/评估索引.json') return { 去向: 'private-evaluations', 类型: 'private-evaluations' }
  if (p === 'data/日记/私密/已删除.json') return { 去向: 'private-deletions', 类型: 'private-deletions' }
  let m = /^data\/日记\/(日|周)\/(\d{4})\/(\d{4}-(?:\d\d-\d\d|W\d\d))\.json$/u.exec(p)
  if (m && m[2] === m[3].slice(0,4) && (m[1] === '周') === m[3].includes('W')) return { 去向: 'diary', 类型: 'diary', 可见性: 'shared', 日记类型: m[1], 周期: m[3] }
  m = /^data\/日记\/私密\/(\d{4})\/(\d{4}-\d\d-\d\d)\.json$/u.exec(p)
  if (m && m[1] === m[2].slice(0,4)) return { 去向: 'diary', 类型: 'private-diary', 可见性: 'private', 日记类型: '日', 周期: m[2] }
  m = /^channels\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})\/(映射|任务)\.json$/u.exec(p)
  if (m) return { 去向: 'state', 类型: m[2] === '映射' ? 'channel-map' : 'channel-tasks', 业务类型: m[2] === '映射' ? 'channel-map' : 'channel-tasks', 号: m[1] }
  if (/^data\/(附件|整理历史|清空历史)\/.+/u.test(p) || ['data/尺子对账.jsonl','data/小测试.txt'].includes(p)) return { 去向: 'external', 类型: 'external' }
  if (/^data\/聊天记录\/.+(?:\.已并入|前.*\.jsonl|前.*\.json|\.清理前\.jsonl)$/u.test(p)) return { 去向: 'external', 类型: 'historical' }
  if (/^workspace\/(工作(?:-[a-f0-9]{12})?|学习)\/.+/u.test(p)) return { 去向: 'external', 类型: 'workspace-file' }
  if (/^workspace\/产物-[a-f0-9]{12}$/u.test(p)) return { 去向:'external', 类型:'work-product' }
  if (['cache/表达反馈.json','cache/没做完的.json'].includes(p) || /^cache\/没做完的-(?!temp-)[a-zA-Z0-9_-]+\.json$/u.test(p)) return { 去向:'external', 类型:'persistent-cache' }
  return { 去向: 'unmapped', 类型: 'unmapped' }
}
const 必留缓存 = Object.freeze(Object.values(固定状态来源).map(([p]) => p).filter((p) => p.startsWith('cache/')))
module.exports = { 固定状态来源, 固定旧档, 必留缓存, 识别来源 }
