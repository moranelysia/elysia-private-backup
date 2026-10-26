/** F3B：显式根的只读元数据登记；不读内容、不写副本、不把未冻结采样称为备份。 */
'use strict'
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto')
const { 纯数据 } = require('./sqlite-state.cjs')
const { 识别来源, 必留缓存, 固定旧档, 固定状态来源 } = require('./sqlite-sources.cjs')
const 核心域 = Object.freeze(['data','cache','channels','workspace/学习','workspace/工作','resource/persona','local/configuration', ...['脑','core','main','storage','renderer','tools','icon-source'].map((x) => 'source/'+x), ...['main.js','preload.js','package.json','package-lock.json','icon.ico','desktop-icon.ico'].map((x) => 'source/'+x), 'workspace/start-all.cmd','workspace/start-all.cjs'])
const 非业务缓存目录 = new Set(['脖子对比','拆层自检','废弃试验','复核基线','工具输出','肩颈改进','上下文截图用户数据','探针','无界面联通测试','asr','asr-candidates','hair-test','Live2D-native-headwear-v13','live2d-player','Live2D交互备份','Live2D接入备份','npm','p2l','psd2live-v7-unpack-2','v5预览','临时对话附件'])
const 签 = (s) => [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':')
const 哈希 = (s) => createHash('sha256').update(s).digest('hex')
function 失败(c) { throw Error('SQLITE_INVENTORY_'+c) }
function 内含(a,b) { const r = path.relative(a,b); return !path.isAbsolute(r) && r !== '..' && !r.startsWith('..'+path.sep) }
function 正常路径(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || /^[\\/]{2}/u.test(p) || /[\x00-\x1f]/u.test(p) || (process.platform === 'win32' && p.slice(2).includes(':'))) 失败('PATH_INVALID')
  const real = path.resolve(p)
  if (real === path.parse(real).root) 失败('ROOT_INVALID')
  for (let q = real;; q = path.dirname(q)) { try { if (fs.lstatSync(q).isSymbolicLink()) 失败('LINK_FORBIDDEN') } catch (e) { if (e.code !== 'ENOENT') throw e } if (q === path.dirname(q)) break }
  return real
}
function 元数据分类(p, dir) {
  if (p === 'local/configuration') return { 去向:'separate-secret', 类型:'local-configuration-metadata-only' }
  const s = 识别来源(p); if (s.去向 !== 'unmapped') return s
  if (p.startsWith('source/') || p.startsWith('resource/') || /^workspace\/start-all\.(cmd|cjs)$/u.test(p)) {
    if (dir && ['node_modules','.git','__pycache__'].includes(p.split('/').at(-1))) return { 去向:'excluded', 类型:'rebuildable-dependency' }
    return { 去向:'release', 类型:'code-or-resource' }
  }
  if (p.startsWith('cache/')) {
    const n = p.slice(6)
    if (dir && 非业务缓存目录.has(n)) return { 去向:'excluded', 类型:'temporary-or-asset-copy' }
    if (/^没做完的-temp-[a-zA-Z0-9_-]+\.json$/u.test(n) || /^(?:UI阶段\d+-.*\.json|聚类门控验收前哈希\.json|角色卡\.json\..+|mcp-schema\.ps1|probe-v\d+\.(?:err|log)|她启动时的输出\.log|账本诊断\.log|验收-长期记忆关系图\.log)$/u.test(n) || /\.(?:png|jpg|html|cjs|js|txt|mp3)$/iu.test(n)) return { 去向:'excluded', 类型:'test-or-temporary-artifact' }
  }
  return s
}
function 盘点显式来源(原, scope) {
  const 范围 = 纯数据(scope)
  if (Object.keys(范围).length !== 2 || 范围.用途 !== 'local-source-inventory' || 范围.包含私密 !== true) 失败('SCOPE_REQUIRED')
  const profile = 纯数据(原)
  if (Object.keys(profile).length !== 2 || profile.版本 !== 1 || !Array.isArray(profile.根) || profile.根.length > 80) 失败('INPUT_INVALID')
  const seen = new Set(), roots = profile.根.map((r) => {
    if (Object.keys(r).sort().join(',') !== ['域','路径','模式','允许缺省','缺省说明'].sort().join(',') || typeof r.域 !== 'string' || (!核心域.includes(r.域) && !/^workspace\/工作-[a-f0-9]{12}$/u.test(r.域)) || seen.has(r.域) || !['tree','file','cache'].includes(r.模式) || typeof r.允许缺省 !== 'boolean' || typeof r.缺省说明 !== 'string') 失败('ROOT_INVALID')
    seen.add(r.域)
    if (r.域 === 'cache' ? r.模式 !== 'cache' : r.模式 === 'cache') 失败('ROOT_INVALID')
    if (r.路径 === null) { if (!r.允许缺省 || !r.缺省说明.trim()) 失败('ABSENCE_REQUIRED'); return r }
    return { ...r, 路径:正常路径(r.路径) }
  })
  if (核心域.some((x) => !seen.has(x))) 失败('ROOTS_INCOMPLETE')
  const nonnull = roots.filter((r) => r.路径 !== null)
  for (let i=0;i<nonnull.length;i++) for (let j=i+1;j<nonnull.length;j++) if (内含(nonnull[i].路径,nonnull[j].路径) || 内含(nonnull[j].路径,nonnull[i].路径)) 失败('ROOT_OVERLAP')
  function 扫() {
    const 项 = [], 缺省 = [], ids = new Set(); let 节点 = 0
    function 加(p, logical, 深, cacheTop = false) {
      if (++节点 > 24000 || 深 > 16) 失败('LIMIT')
      const st = fs.lstatSync(p, { bigint:true }); if (st.isSymbolicLink()) 失败('LINK_FORBIDDEN')
      if (!st.isDirectory() && (!st.isFile() || st.nlink !== 1n || st.size > BigInt(Number.MAX_SAFE_INTEGER))) 失败('FILE_INVALID')
      const s = 元数据分类(logical,st.isDirectory()), key = logical.toLowerCase(); if (ids.has(key)) 失败('COLLISION'); ids.add(key)
      if (st.isDirectory()) {
        if (['legacy','state','diary','private-evaluations','private-deletions'].includes(s.去向)) 失败('SOURCE_TYPE_INVALID')
        if (['excluded','separate-secret'].includes(s.去向) || (cacheTop && s.去向 === 'unmapped')) { 项.push({ 来源:logical, 目录:true, 字节数:0, 签名:签(st), ...s }); return }
        for (const n of fs.readdirSync(p).sort()) 加(path.join(p,n),logical+'/'+n,深+1,logical === 'cache')
      } else 项.push({ 来源:logical, 目录:false, 字节数:Number(st.size), 签名:签(st), ...s })
    }
    for (const r of roots) {
      if (r.路径 === null) { 缺省.push({ 域:r.域, 状态:'未配置', 原因:r.缺省说明 }); continue }
      let st; try { st = fs.lstatSync(r.路径) } catch (e) { if (e.code !== 'ENOENT' || !r.允许缺省 || !r.缺省说明.trim()) throw e; 缺省.push({ 域:r.域, 状态:'不存在', 原因:r.缺省说明 }); continue }
      if (r.模式 === 'file' ? !st.isFile() : !st.isDirectory()) 失败('ROOT_INVALID')
      加(r.路径,r.域,0)
    }
    return { 项, 缺省 }
  }
  const a = 扫(), b = 扫(); if (JSON.stringify(a) !== JSON.stringify(b)) 失败('SOURCE_CHANGED')
  const 源 = a.项.map(({签名,...x}) => x), 未登记 = 源.filter((x) => x.去向 === 'unmapped').map((x) => x.来源)
  const 阻断 = [...(未登记.length ? ['UNMAPPED_SOURCE'] : []), ...(源.some((x) => x.去向 === 'separate-secret' && x.来源.startsWith('data/')) ? ['SECRET_IN_DATA_ROOT'] : [])]
  const 登记文件 = [...Object.keys(固定旧档),...Object.values(固定状态来源).map(([p])=>p),'data/日记/私密/评估索引.json','data/日记/私密/已删除.json']
  return { 版本:1, 用途:'local-source-inventory-report', 可切换:false, 来源登记完整:阻断.length === 0, 一致性:'双次元数据诊断，未冻结且未读取内容', 清单指纹:哈希(JSON.stringify({根:roots,元数据:a})), 根:roots, 来源:源, 缺省:a.缺省, 未登记, 未存在的已登记业务:登记文件.filter((p)=>!源.some((x)=>x.来源===p)), 未存在的已登记缓存:必留缓存.filter((p) => !源.some((x) => x.来源 === p)), 阻断, 后续必须:['SOURCE_NOT_FROZEN','CONTENT_HASH_NOT_VERIFIED','REFERENCE_COVERAGE_NOT_VERIFIED','BUSINESS_SHADOW_NOT_VERIFIED'] }
}
module.exports = { 盘点显式来源, 核心域, 元数据分类 }
