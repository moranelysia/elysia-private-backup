'use strict'
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process')
const { 创建隔离仓储, 恢复隔离仓储, 创建本机影子仓储, 恢复本机影子仓储, 备份范围, 内部备份测试 } = require('../storage/sqlite-backup.cjs')
const { 识别来源 } = require('../storage/sqlite-sources.cjs'), { 场景, 时间, 本机, 篇, 渠道 } = require('./fixtures/sqlite-backup-scenario.cjs')
const { 写入隔离回退 } = require('../storage/rollback-files.cjs')
const 拷 = (x) => JSON.parse(JSON.stringify(x)), 测试 = [], 测 = (n,f) => 测试.push([n,f]); let 模板
const 包 = (local = false) => ({ 版本:1, 用途:local?'local-state-import':'synthetic-state-import', 文档:拷(模板) })
const 备 = (r, 文件=[]) => r.创建备份({ 时间, 外部文件:文件, 必须文件:文件.map((x) => x.路径) },备份范围)
async function 用库(f, { local=false, 导入=true, 改包 } = {}) {
  const r = local ? 创建本机影子仓储({用途:'local-shadow-repository',包含私密:true}) : 创建隔离仓储({用途:'synthetic-sqlite-repository'}), p=包(local)
  try { if(改包)改包(p); if(导入)assert.equal(r.导入旧状态(p,备份范围).好,true); await f(r,p,内部备份测试(r).db) } finally {r.关闭()}
}
const 找 = (p,路径) => p.文档.find((d)=>d.路径===路径)
function 改文(p,路径,f){const d=找(p,路径),x=JSON.parse(d.原文.replace(/^\uFEFF/u,''));f(x);d.原文=JSON.stringify(x)}
测('其余所有登记状态进入同库，默认共享出口继续排除private',()=>用库((r,p)=>{
  assert.equal(r.日记.读取共享().length,2);assert.equal(r.日记.读取本机私密(本机).length,1);assert.equal(JSON.stringify(r.日记.导出共享()).includes('捏着衣角'),false)
  assert.equal(r.状态.读取快照('usage','desktop').数据.length,1);assert.equal(r.状态.读取快照('usage','headless').数据.length,1)
  assert.equal(r.状态.读取快照('background-state','relations').数据.格式版本,1);assert.equal(r.状态.读取快照('background-state','relations-headless').数据.端,'headless');assert.equal(r.核验().好,true)
}))
测('原BOM/CRLF、未知字段和来源次序逐字保留，导入不运行生成器',()=>用库((r,p)=>{
  const docs=r.导出原格式(备份范围).文档
  for(const d of p.文档)assert.equal(docs.find((x)=>x.路径===d.路径).原文,d.原文)
  assert.equal(r.日记.读取本机私密(本机)[0].日记.扩展.空值,null)
}))
测('同包幂等，明确编辑后再导入不覆盖，异包拒绝',()=>用库((r,p)=>{
  const e=r.日记.读取共享()[0];assert.equal(r.日记.修改共享({编号:e.日记.编号,预期版本:1,时间,标题:'修改后的标题',模块:e.日记.模块}).好,true)
  assert.equal(r.导入旧状态(p,备份范围).新导入,false);assert.equal(r.日记.读取共享()[0].日记.标题,'修改后的标题')
  const q=拷(p);q.文档[0].原文+=' ';assert.throws(()=>r.导入旧状态(q,备份范围),{message:'SQLITE_BACKUP_IMPORT_CONFLICT'})
}))
测('shared/private删除继续生效，恢复后旧源不能复活正文',()=>用库((r,p)=>{
  const pub=r.日记.读取共享()[0].日记,priv=r.日记.读取本机私密(本机)[0].日记
  assert.equal(r.日记.删除共享({编号:pub.编号,预期版本:1,时间}).好,true);assert.equal(r.日记.删除私密({编号:priv.编号,预期版本:1,时间},本机).好,true)
  const b=备(r),rr=恢复隔离仓储(b,备份范围);try{rr.导入旧状态(p,备份范围);assert.equal(rr.日记.读取共享().length,1);assert.equal(rr.日记.读取本机私密(本机).length,0);assert.equal(rr.日记.写入私密({日记:priv,预期版本:0}).代码,'SQLITE_DIARY_DELETED');assert.equal(JSON.stringify(b.文档).includes('捏着衣角'),false);assert.equal(rr.核验().好,true)}finally{rr.关闭()}
}))
测('导入关系可用原图谱删除，抑制和未知字段跨备份恢复保留',()=>用库((r,p)=>{
  const {创建关系图库}=require('../脑/记忆关系图.cjs'),edge=r.状态.读取快照('relations').数据.关系[0]
  const long=[edge.从,edge.到].map((x,i)=>({...x,内容:'我们记得的一段片段'+i,时间:时间}))
  const 图=创建关系图库({存储:{关系:r.状态.创建后端('relations'),布局:r.状态.创建后端('relation-layout')},长期记忆库:{全部长期记忆:()=>long},现在:()=>new Date(时间)})
  assert.equal(图.删除(edge.编号).好,true);const b=备(r),rr=恢复隔离仓储(b,备份范围)
  try{rr.导入旧状态(p,备份范围);const x=rr.状态.读取快照('relations').数据;assert.equal(x.关系.length,0);assert.equal(x.自动抑制.length,1);assert.deepEqual(x.未知扩展,{空:null})}finally{rr.关闭()}
},{改包:p=>改文(p,'data/关系图.json',x=>x.未知扩展={空:null})}))
测('旧删除标记和终态原样接入，删除时间缺省不猜成当前时间',()=>用库((r,p,db)=>{
  assert.equal(r.日记.写入私密({日记:篇(true,'2026-10-23'),预期版本:0}).代码,'SQLITE_DIARY_DELETED')
  assert.equal(db.prepare("SELECT deleted_raw FROM diary_deleted WHERE visibility='private'").get().deleted_raw,'')
  const docs=r.导出原格式(备份范围).文档;assert.equal(docs.find((d)=>d.路径==='data/日记/私密/已删除.json').原文,找(p,'data/日记/私密/已删除.json').原文)
},{改包:p=>{改文(p,'data/日记/私密/已删除.json',x=>{x.周期=['2026-10-23']});改文(p,'data/日记/私密/评估索引.json',x=>{x.任务.push({周期:'2026-10-23',状态:'已删除',更新于:'',尝试次数:0,下次尝试:''})})}}))
测('本机影子入口与synthetic导入/快照/恢复用途隔离，仍仅内存',()=>用库((r,p)=>{
  const b=备(r);assert.equal(b.版本,4);assert.equal(b.用途,'local-sqlite-shadow-backup');assert.equal(r.导出原格式(备份范围).用途,'local-json-rollback');assert.throws(()=>恢复隔离仓储(b,备份范围));assert.throws(()=>r.导入旧状态(包(false),备份范围))
  const rr=恢复本机影子仓储(b,备份范围);try{assert.equal(rr.日记.读取共享().length,2);assert.equal(rr.导入旧状态(p,备份范围).新导入,false)}finally{rr.关闭()}
},{local:true}))
测('原synthetic创建器拒绝本机范围，本机创建器要求显式private',()=>{
  assert.throws(()=>创建隔离仓储({用途:'local-shadow-repository',包含私密:true}));assert.throws(()=>创建本机影子仓储({用途:'local-shadow-repository'}));assert.throws(()=>创建本机影子仓储({用途:'local-shadow-repository',包含私密:false}));assert.throws(()=>创建本机影子仓储({get 用途(){assert.fail('GETTER')},包含私密:true}))
})
测('旧渠道完成任务恢复后不重新处理或发送，导入不会新建许可',()=>用库(async(r)=>{const x=await 渠道(r,()=>assert.fail('CORE_REPEATED'));assert.equal(x.任务[0].状态,'sent');assert.equal(x.观测.模拟送达数,0)}))
测('缺渠道映射不能只恢复任务并冒充可续发',()=>用库((r,p)=>{p.文档=p.文档.filter((d)=>d.类型!=='channel-map');assert.throws(()=>r.导入旧状态(p,备份范围),{message:'SQLITE_BACKUP_IMPORT_CHANNEL_MAP_MISSING'});assert.equal(r.状态.核验().文档数,0)},{导入:false}))
for(const [名,改] of [
 ['来源路径与日记周期不符',p=>{const d=p.文档.find(d=>d.类型==='diary');d.路径=d.路径.replace('2026-10-24.json','2026-10-23.json')}],
 ['缺共享任务索引',p=>{p.文档=p.文档.filter(d=>d.类型!=='diary-index')}],
 ['缺共享正文',p=>{p.文档=p.文档.filter(d=>d.路径!=='data/日记/日/2026/2026-10-24.json')}],
 ['私密评估孤立',p=>{p.文档=p.文档.filter(d=>d.类型!=='private-diary')}],
 ['私密删除缺评估',p=>改文(p,'data/日记/私密/已删除.json',x=>x.周期=['2026-10-22'])],
 ['私密删除仍带正文',p=>改文(p,'data/日记/私密/已删除.json',x=>x.周期=['2026-10-25'])],
 ['私密扩展评估正文',p=>改文(p,'data/日记/私密/评估索引.json',x=>x.任务[0].正文='不能保留')],
 ['私密评估根未知字段',p=>改文(p,'data/日记/私密/评估索引.json',x=>x.未知='不能静默丢失')],
 ['非法可见性',p=>改文(p,'data/日记/私密/2026/2026-10-25.json',x=>x.可见性='shared')],
 ['未知来源',p=>p.文档.push({路径:'data/unknown.json',类型:'auxiliary',原文:'{}'})],
 ['渠道BOM不兼容',p=>{const d=p.文档.find(d=>d.类型==='channel-map');d.原文='\uFEFF'+d.原文}],
 ['重复JSON键',p=>{const d=p.文档.find(d=>d.类型==='relations');d.原文=d.原文.replace('"格式版本": 2','"格式版本": 2,"格式版本":2')}],
])测(名+'拒绝且状态整批不落地',()=>用库((r,p)=>{改(p);assert.throws(()=>r.导入旧状态(p,备份范围));assert.equal(r.状态.核验().文档数,0);assert.equal(r.日记.读取共享().length,0);assert.equal(r.日记.读取本机私密(本机).length,0)},{导入:false}))
测('真实SQL中途失败连同私密/任务/绑定标记一起回滚，可重试',()=>用库((r,p,db)=>{
  db.exec("CREATE TEMP TRIGGER fail_import BEFORE INSERT ON diary_private_evaluations BEGIN SELECT RAISE(ABORT,'injected'); END");assert.throws(()=>r.导入旧状态(p,备份范围));assert.equal(r.状态.核验().文档数,0);assert.equal(db.prepare("SELECT 1 FROM repository_meta WHERE key='state_import_manifest'").get(),undefined);db.exec('DROP TRIGGER fail_import');assert.equal(r.导入旧状态(p,备份范围).新导入,true)
},{导入:false}))
测('非空状态不得覆盖，读取的副本不能改动数据库',()=>用库((r,p)=>{
  const b=r.状态.创建后端('usage','desktop');b.读取();b.保存([]);b.关闭();assert.throws(()=>r.导入旧状态(p,备份范围),{message:'SQLITE_BACKUP_IMPORT_NOT_EMPTY'});assert.deepEqual(r.状态.读取快照('usage','desktop').数据,[])
},{导入:false}))
测('绑定清单损坏或已导入正文无墓碑消失时拒绝备份和再次导入',async()=>{
  for(const sql of ["UPDATE repository_meta SET value='bad' WHERE key='state_import_manifest_hash'","DELETE FROM diary_entries WHERE visibility='private'","DELETE FROM diary_private_evaluations"])await 用库((r,p,db)=>{db.exec(sql);assert.throws(()=>备(r));assert.throws(()=>r.导入旧状态(p,备份范围))})
})
测('已删除周期和私密评估文件原顺序不被时间排序改变',()=>用库((r,p)=>{const docs=r.导出原格式(备份范围).文档;for(const t of ['private-evaluations','private-deletions'])assert.equal(docs.find(d=>d.类型===t).原文,p.文档.find(d=>d.类型===t).原文)},{改包:p=>{
  改文(p,'data/日记/私密/评估索引.json',x=>x.任务.push(...['2026-10-23','2026-10-22'].map(周期=>({周期,状态:'已删除',更新于:'',尝试次数:0,下次尝试:''}))));改文(p,'data/日记/私密/已删除.json',x=>x.周期=['2026-10-23','2026-10-22'])
}}))
测('凭据配置不进入外部文件包，已登记历史/审计/反馈可以保全',()=>用库((r)=>{
  const 文件=['data/尺子对账.jsonl','data/小测试.txt','data/聊天记录/备份前-2026.jsonl','cache/表达反馈.json','cache/没做完的-old-chat.json'].map(路径=>({路径,base64:Buffer.from('fixture').toString('base64')}));assert.equal(备(r,文件).外部文件.length,5)
  for(const 路径 of ['cache/设置.json','cache/deepseek-api-key.dat','cache/没做完的-temp-a.json','data/unknown.json','data/附件/.env','workspace/学习/.git/config'])assert.throws(()=>备(r,[{路径,base64:''}]))
}))
测('旧状态备份不能改版本降级而绕过绑定清单',()=>用库((r)=>{
  const {createHash}=require('node:crypto'),b=备(r);b.版本=2;const{指纹,...c}=b;b.指纹=createHash('sha256').update(JSON.stringify(c)).digest('hex');assert.throws(()=>恢复隔离仓储(b,备份范围),{message:'SQLITE_BACKUP_VERSION_UNSUPPORTED'})
}))
for(const state of ['sending','processing'])测('导入'+state+'恢复遵循原unknown/interrupted规则，旧任务不重发',()=>用库(async(r)=>{
  const x=await 渠道(r,()=>assert.fail('CORE_REPEATED'));assert.equal(x.任务[0].状态,state==='sending'?'unknown':'interrupted');assert.equal(x.观测.模拟送达数,0)
},{改包:p=>改文(p,'channels/fake/任务.json',x=>{const t=x.记录[0];t.状态=state;t.回执=null;if(state==='processing'){t.发送=null;t.尝试=0}})}))
测('断开文件/网络能力后仍能导入并备份，不能触发业务文件调用',()=>用库((r,p)=>{
  const old={readFileSync:fs.readFileSync,writeFileSync:fs.writeFileSync,openSync:fs.openSync},fetch=global.fetch
  try{for(const k of Object.keys(old))fs[k]=()=>assert.fail('BUSINESS_FILE');global.fetch=()=>assert.fail('NETWORK');r.导入旧状态(p,备份范围);assert.equal(备(r).文档.some(d=>d.类型==='private-diary'),true)}finally{Object.assign(fs,old);global.fetch=fetch}
},{导入:false}))
测('提交已生效但回执丢失会封闭能力，不能重新导入假装成功',()=>用库((r,p,db)=>{
  const exec=db.exec.bind(db);db.exec=sql=>{const x=exec(sql);if(sql==='COMMIT')throw Error('lost');return x};assert.throws(()=>r.导入旧状态(p,备份范围),{message:'SQLITE_CONTEXT_COMMIT_UNKNOWN'});assert.equal(r.取状态().可用,false)
},{导入:false}))
测('实际回退文件由原日记/私密读取器读到删除和人工修改',()=>用库((r)=>{
  const x=r.日记.读取共享()[0].日记;r.日记.修改共享({编号:x.编号,预期版本:1,时间,标题:'旧篇改过',模块:x.模块});r.日记.删除私密({编号:篇(true).编号,预期版本:1,时间},本机)
  const out=写入隔离回退(备(r),备份范围)
  try{const code="const a=require('node:assert/strict'),p=require('./脑/私密日记.cjs'),d=require('./脑/记忆日记.cjs');a.equal(p.创建私密日记库({数据目录:process.env.ELYSIA_DATA_DIR}).给本机界面().列表.length,0);a.ok(d.创建日记系统({数据目录:process.env.ELYSIA_DATA_DIR}).给界面().列表.some(x=>x.标题==='旧篇改过'));process.stdout.write('STATE_READERS_OK')";assert.equal(execFileSync(process.execPath,['-e',code],{encoding:'utf8',windowsHide:true,env:{...process.env,ELYSIA_WORKSPACE_ROOT:out.根,ELYSIA_CONFIG_FILE:path.join(out.根,'absent.json'),ELYSIA_DATA_DIR:out.数据目录,ELYSIA_CACHE_DIR:out.缓存目录}}),'STATE_READERS_OK')}
  finally{const real=fs.realpathSync(out.根);assert.equal(path.dirname(real).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());assert.ok(path.basename(real).startsWith('elysia-sqlite-E-'));fs.rmSync(real,{recursive:true,force:true})}
}))
;(async()=>{
  const s=await 场景();try{模板=s.仓.导出原格式(备份范围).文档.filter(d=>['state','diary','private-evaluations','private-deletions'].includes(识别来源(d.路径).去向)).map(({路径,类型,原文})=>({路径,类型,原文:['usage','channel-map','channel-tasks','extraction-buffer'].includes(类型)?原文:'\uFEFF'+原文.replace(/\n/gu,'\r\n')}))}finally{s.仓.关闭()}
  let pass=0;for(const [n,f]of 测试){try{await f();pass++;console.log('PASS '+n)}catch(e){console.error('FAIL '+n+'\n'+e.stack)}}console.log(`SQLite S-15F3B state: ${pass}/${测试.length}`);if(pass!==测试.length)process.exitCode=1
})().catch(e=>{console.error(e.stack);process.exitCode=1})
