'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto')
const {准备冻结,创建冻结副本,核验冻结}=require('../storage/frozen-sources.cjs'),{创建本机影子仓储,恢复本机影子仓储,备份范围,内部备份测试}=require('../storage/sqlite-backup.cjs'),{旧格式范围}=require('../storage/sqlite-legacy.cjs'),{写入本机影子回退}=require('../storage/rollback-files.cjs')
const scope={用途:'local-source-inventory',包含私密:true},hash=b=>createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x))
function profile(file){if(!path.isAbsolute(file))throw Error('SQLITE_FREEZE_PROFILE_REQUIRED');const x=JSON.parse(fs.readFileSync(file,'utf8')),根=clone(x.根),data=根.find(r=>r.域==='data')?.路径;if(!data)throw Error('SQLITE_FREEZE_PROFILE_REQUIRED');const idx=JSON.parse(fs.readFileSync(path.join(data,'工作索引.json'),'utf8').replace(/^\uFEFF/u,''));if(!Array.isArray(idx))throw Error('WORK_REFERENCE_UNSUPPORTED')
 const contains=(a,b)=>{const rel=path.relative(a,b);return !path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)}
 const refs=[...new Set(idx.flatMap(r=>r.产物||[]))];for(const p of refs){if(typeof p!=='string'||!path.isAbsolute(p)||/^[\\/]{2}/u.test(p)||/[\x00-\x1f]/u.test(p)||require('../storage/sqlite-sources.cjs').识别来源('workspace/工作/'+path.basename(p)).去向==='separate-secret')throw Error('WORK_REFERENCE_UNSUPPORTED');if(根.some(r=>r.路径&&contains(r.路径,p)))continue;根.push({域:'workspace/产物-'+hash(p).slice(0,12),路径:p,模式:'file',允许缺省:true,缺省说明:'工作索引产物引用；若不存在须明确保留失效状态'})}
 return{版本:x.版本,根}}
function parse(d){const s=d.原文.replace(/^\uFEFF/u,'');return ['messages','usage'].includes(d.类型)?s.split('\n').filter(x=>x.trim()).map(x=>JSON.parse(x)):JSON.parse(s)}
function reader(code,root,checks){return JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'fixtures/sqlite-shadow-reader.cjs'),code,root,...(checks?[checks]:[])],{encoding:'utf8',windowsHide:true,timeout:60000,env:{...process.env,ELYSIA_CONFIG_FILE:path.join(root,'migration/absent-config.json')}}))}
function pages(fn){let cursor=null,out=[];do{const p=fn({大小:37,游标:cursor});out=p.消息.concat(out);cursor=p.下一页}while(cursor);return out.map(x=>x.原始)}
function references(docs,manifest){
 const get=t=>docs.filter(d=>d.类型===t).flatMap(parse),sessions=get('conversations'),ids=new Set(sessions.map(x=>x.编号)),messages=get('messages'),long=['facts','episodes','notebook'].flatMap(get),temporary=get('temporary').flatMap(x=>x.记录),files=new Set(manifest.文件.map(x=>x.路径)),oldKeys=new Set(long.map(x=>x.类别+':'+x.编号))
 assert.ok(messages.every(x=>!x.对话||x.对话==='最早'||ids.has(x.对话)),'MESSAGE_REFERENCE_INVALID');assert.ok(long.every(x=>!x.对话||ids.has(x.对话)),'LONG_REFERENCE_INVALID');assert.ok(temporary.every(x=>!x.来源?.对话||ids.has(x.来源.对话)),'TEMP_REFERENCE_INVALID')
 for(const t of temporary)if(t.生命周期==='已晋升')assert.ok(oldKeys.has(t.晋升.去向+':'+t.晋升.目标编号),'PROMOTION_REFERENCE_INVALID')
 const logicalFor=absolute=>{if(typeof absolute!=='string'||!path.isAbsolute(absolute))throw Error('WORK_REFERENCE_UNSUPPORTED');const roots=(manifest.来源根||[]).filter(x=>/^(data|workspace\/(?:工作(?:-[a-f0-9]{12})?|学习|产物-[a-f0-9]{12}))$/u.test(x.域)).filter(x=>{const rel=path.relative(x.路径,absolute);return !path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep)}).sort((a,b)=>b.路径.length-a.路径.length);if(!roots.length)throw Error('WORK_REFERENCE_UNREGISTERED');const rel=path.relative(roots[0].路径,absolute).split(path.sep).join('/');return roots[0].域+(rel?'/'+rel:'')}
 const resourceRefs=[],seen=new Set(),addRef=(类型,原始路径,逻辑路径,状态)=>{const key=JSON.stringify([类型,原始路径]);if(!seen.has(key)){seen.add(key);resourceRefs.push({类型,原始路径,逻辑路径,状态})}}
 const work=get('work-index');let workRefs=0,missingWork=0;for(const w of work){if(w.工作区){const domain=logicalFor(w.工作区);assert.ok((manifest.来源根||[]).some(x=>x.域===domain),'WORK_ROOT_UNREGISTERED')}for(const f of w.产物||[]){const logical=logicalFor(f);if(files.has(logical))addRef('work-product',f,logical,'present');else{assert.ok(manifest.缺省.some(x=>x.域===logical&&x.状态==='不存在'),'WORK_REFERENCE_MISSING');addRef('work-product',f,null,'missing-before-freeze');missingWork++}workRefs++}}
 // 附件不猜绝对旧路径：已知结构的文件名/相对路径须能在冻结附件集合精确定位。
 let attachmentRefs=0;for(const m of messages){if(Array.isArray(m.附件))for(const a of m.附件){const n=typeof a==='string'?a:a?.文件名||a?.路径;if(!n)throw Error('ATTACHMENT_REFERENCE_UNSUPPORTED');const logical=n.startsWith('data/附件/')?n:path.isAbsolute(n)?logicalFor(n):'data/附件/'+path.basename(n);assert.ok(files.has(logical),'ATTACHMENT_REFERENCE_MISSING');addRef('attachment',n,logical,'present');attachmentRefs++}for(const a of String(m.内容||'').matchAll(/^\[附件\]\s+(.+?)（(?:图片|文件)，[^\r\n]*）/gmu)){const logical='data/附件/'+path.basename(a[1]);assert.ok(files.has(logical),'ATTACHMENT_REFERENCE_MISSING');addRef('attachment',a[1],logical,'present');attachmentRefs++}}
 return{sessions,messages,long,temporary,资源引用:resourceRefs,报告:{原索引会话:sessions.length,原始消息:messages.length,无对话字段历史:messages.filter(x=>!x.对话).length,长期:long.length,临时:temporary.length,普通日记正文:docs.filter(x=>x.类型==='diary').length,私密日记正文:docs.filter(x=>x.类型==='private-diary').length,附件引用:attachmentRefs,工作产物引用:workRefs,冻结前已缺失产物:missingWork,外部文件:manifest.文件.filter(x=>x.去向==='external').length,渠道来源:manifest.文件.filter(x=>x.路径.startsWith('channels/')).length}}
}
function 验证影子(frozen,finalSourceCheck){
 const manifest=核验冻结(frozen),root=path.dirname(frozen),code=path.join(frozen,'source'),docs=manifest.文件.filter(x=>['legacy','state','diary','private-evaluations','private-deletions'].includes(x.去向)).map(x=>({路径:x.路径,类型:x.类型,去向:x.去向,原文:fs.readFileSync(path.join(frozen,x.路径),'utf8')}));let ref;try{ref=references(docs,manifest)}catch(e){e.phase='reference-coverage';e.隔离目录=root;throw e}
 const 仓=创建本机影子仓储({用途:'local-shadow-repository',包含私密:true}),sql=内部备份测试(仓).db,外部=manifest.文件.filter(x=>x.去向==='external').map(x=>({路径:x.路径,字节数:x.字节数,sha256:x.sha256})),时间=new Date().toISOString()
 let phase='import'
 try{
  仓.旧格式.导入({版本:1,用途:旧格式范围.用途,文档:docs.filter(x=>x.去向==='legacy').map(({路径,类型,原文})=>({路径,类型,原文}))},旧格式范围);仓.旧格式.接入旧记忆(旧格式范围)
  仓.导入旧状态({版本:1,用途:'local-state-import',文档:docs.filter(x=>x.去向!=='legacy').map(({路径,类型,原文})=>({路径,类型,原文}))},备份范围)
  phase='native-comparison'
  const longs=sql.prepare('SELECT record_json FROM memory_long').all().map(x=>JSON.parse(x.record_json)),temps=sql.prepare('SELECT record_json FROM memory_temporary ORDER BY rowid').all().map(x=>JSON.parse(x.record_json))
  const sort=x=>[...x].sort((a,b)=>JSON.stringify([a.类别,a.编号]).localeCompare(JSON.stringify([b.类别,b.编号])))
  assert.deepEqual(sort(longs),sort(ref.long));assert.deepEqual(temps,ref.temporary)
  for(const s of ref.sessions)assert.deepEqual(pages(q=>仓.旧格式.读消息页({...q,对话:s.编号})),ref.messages.filter(x=>s.编号==='最早'?(!x.对话||x.对话==='最早'):x.对话===s.编号))
  assert.deepEqual(pages(q=>仓.旧格式.读最早历史页(q)),ref.messages.filter(x=>!x.对话||x.对话==='最早'))
  const baseline=仓.导出原格式(备份范围);for(const d of docs)assert.equal(baseline.文档.find(x=>x.路径===d.路径).原文,d.原文)
  const makeBackup=()=>仓.创建备份({时间,外部文件:外部,必须文件:外部.map(x=>x.路径),资源引用:ref.资源引用},备份范围)
  const baselinePack=makeBackup(),baselineOut=写入本机影子回退(baselinePack,备份范围,{输出父目录:root,外部来源目录:frozen})
  phase='original-reader-baseline';const sourceView=reader(code,frozen),rollbackView=reader(code,baselineOut.目录);assert.deepEqual(rollbackView,sourceView)
  const portableOut=写入本机影子回退(baselinePack,备份范围,{输出父目录:root,外部来源目录:baselineOut.目录});assert.deepEqual(reader(code,portableOut.目录),sourceView)
  for(const f of manifest.文件.filter(x=>x.去向==='external'))assert.equal(hash(fs.readFileSync(path.join(baselineOut.目录,f.路径))),f.sha256)
  console.log('F3C_BASELINE_MATCH '+docs.length+' documents')
  phase='controlled-mutations';let op=0
  const 调=(方法,参数)=>{const r=仓.记忆[方法]({操作编号:'migration-'+(++op),时间,预期版本:仓.记忆.取统计().版本,...参数});assert.equal(r.好,true,'MUTATION_'+方法);return r}
  const del=ref.long.find(x=>x.临时记忆)||ref.long[1],edit=ref.long.find(x=>x.编号!==del?.编号);assert.ok(del&&edit,'MEMORY_SAMPLES_REQUIRED')
  if(del.临时记忆){const t=ref.temporary.find(x=>x.编号===del.临时记忆);if(t?.生命周期==='已晋升')assert.equal(调('人工确认晋升',{编号:t.编号,去向:del.类别}).目标编号,del.编号)}
  const newContent='我们在隔离副本中完成迁移演练。';调('人工修改长期',{类别:edit.类别,编号:edit.编号,内容:newContent});调('人工遗忘长期',{类别:del.类别,编号:del.编号})
  if(del.临时记忆){const r=仓.记忆.人工确认晋升({操作编号:'forgotten-target',时间,预期版本:仓.记忆.取统计().版本,编号:del.临时记忆,去向:del.类别});assert.equal(r.代码,'SQLITE_MEMORY_TARGET_FORGOTTEN')}
  const oldTemp=ref.temporary.find(x=>x.生命周期==='有效');if(oldTemp)调('人工处理临时',{动作:'删除',参数:[oldTemp.编号]})
  const add=调('新增临时',{类别:'近期事件',内容:'我们完成了一次隔离迁移演练',细节:{手动:true}}),promotion=调('人工确认晋升',{编号:add.临时编号,去向:'经历'})
  const chat='migration-'+randomUUID();assert.equal(仓.会话.登记对话(chat,{建于:时间,写长期记忆:true}).好,true)
  const round={对话:chat,轮次:'migration-round',用户正文:'这是一条隔离演练消息。',回复正文:'隔离副本已核对。',接收于:时间,完成于:时间},receipt=仓.会话.存对话一轮(round);assert.equal(receipt.好,true)
  const oldSession=ref.sessions.find(x=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(x.编号));assert.ok(oldSession,'SESSION_SAMPLE_REQUIRED');assert.equal(仓.会话.登记对话(oldSession.编号,{建于:时间,写长期记忆:oldSession.写长期记忆!==false}).好,true);assert.equal(仓.会话.更新对话(oldSession.编号,{预期版本:1,标题:'隔离副本会话标题'}).好,true)
  const diary=仓.日记.读取共享()[0],otherDiary=仓.日记.读取共享()[1];assert.ok(diary,'DIARY_SAMPLE_REQUIRED');const diaryTitle='隔离迁移演练记录'
  assert.equal(仓.日记.修改共享({编号:diary.日记.编号,预期版本:diary.版本,时间,标题:diaryTitle,模块:diary.日记.模块}).好,true)
  if(otherDiary)assert.equal(仓.日记.删除共享({编号:otherDiary.日记.编号,预期版本:otherDiary.版本,时间}).好,true)
  const privateRows=仓.日记.读取本机私密({用途:'local-private-diary'});for(const row of privateRows)assert.equal(仓.日记.删除私密({编号:row.日记.编号,预期版本:row.版本,时间},{用途:'local-private-diary'}).好,true)
  // 图谱沿用原引擎，配置只指向冻结副本，后端明确使用当前SQLite。
  process.env.ELYSIA_WORKSPACE_ROOT=path.join(frozen,'workspace');process.env.ELYSIA_CONFIG_FILE=path.join(frozen,'migration/absent-config.json');process.env.ELYSIA_DATA_DIR=path.join(frozen,'data');process.env.ELYSIA_CACHE_DIR=path.join(frozen,'cache');process.env.ELYSIA_学习区=path.join(frozen,'workspace/学习')
  const 图=require(path.join(code,'脑/记忆关系图.cjs')).创建关系图库({存储:{关系:仓.状态.创建后端('relations'),布局:仓.状态.创建后端('relation-layout')},长期记忆库:{全部长期记忆:()=>仓.记忆.列长期({上限:1000}).列表},现在:()=>new Date(时间)})
  const edges=仓.状态.读取快照('relations').数据.关系;if(edges.length)assert.equal(图.删除(edges[0].编号).好,true)
  const mutated=makeBackup();assert.equal(mutated.文档.some(x=>x.类型==='private-diary'),false);assert.equal(sql.prepare("SELECT count(*) n FROM diary_entries WHERE visibility='private'").get().n,0)
  phase='restore-and-rollback';const restored=恢复本机影子仓储(mutated,备份范围)
  try{assert.deepEqual(restored.会话.存对话一轮(round),receipt);assert.equal(restored.旧格式.接入旧记忆(旧格式范围).新接入,false);assert.deepEqual(restored.导出原格式(备份范围),仓.导出原格式(备份范围));assert.equal(restored.记忆.列长期({上限:1000}).列表.some(x=>x.编号===del.编号),false);assert.equal(restored.核验().好,true)}finally{restored.关闭()}
  const changedOut=写入本机影子回退(mutated,备份范围,{输出父目录:root,外部来源目录:frozen}),checks={edit:{编号:edit.编号,内容:newContent,时间:edit.时间},deleted:{编号:del.编号,类别:del.类别},chat,oldSession:{编号:oldSession.编号,建于:String(oldSession.建于||''),标题:'隔离副本会话标题'},promoted:{临时:add.临时编号,长期:promotion.目标编号},deletedTemp:oldTemp?.编号??null,diaryTitle}
  const checksFile=path.join(root,'mutation-checks.json');fs.writeFileSync(checksFile,JSON.stringify(checks),{mode:0o600,flag:'wx'})
  const changedView=reader(code,changedOut.目录,checksFile);assert.equal(changedView.人工改动核对,true)
  phase='final-source-integrity';assert.equal(核验冻结(frozen).指纹,manifest.指纹);if(finalSourceCheck)finalSourceCheck()
  const report={版本:1,用途:'local-shadow-rehearsal-report',时间,好:true,可切换:false,源冻结指纹:manifest.指纹,源文件数:manifest.文件.length,源字节数:manifest.文件.reduce((s,x)=>s+x.字节数,0),来源核对:ref.报告,原读取器基线:sourceView,原格式逐字节文档数:docs.length,外部逐字节文件数:外部.length,附件分离备份版本:baselinePack.版本,独立回退包恢复:true,修改删除晋升恢复:changedView,冻结副本未变:true,源端锁定后复核:!!finalSourceCheck,原数据未写入:true,正式切换:'S-23未执行',独立渠道:ref.报告.渠道来源?'已登记来源，仅本机验证':'当前未配置；真实渠道验证后置',保留目录:{冻结:frozen,基线回退:baselineOut.目录,独立包恢复:portableOut.目录,变更回退:changedOut.目录}}
  fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});return report
 }catch(e){const err=Error(/^SQLITE_|^SHADOW_|^MESSAGE_|^LONG_|^TEMP_|^PROMOTION_|^WORK_|^ATTACHMENT_/u.test(e.message)?e.message:'SQLITE_SHADOW_REHEARSAL_REJECTED');err.phase=phase;err.隔离目录=root;throw err}finally{仓.关闭()}
}
function main(a){
 if(a[0]==='--plan'&&a.length===2){const p=准备冻结(profile(a[1]),scope);console.log(JSON.stringify({指纹:p.清单.清单指纹,文件:p.文件.map(x=>({源路径:x.源路径}))}));return}
 if(a[0]==='--probe-lock'&&a.length===2){let fd;try{fd=fs.openSync(a[1],'r+')}catch(e){if(['EACCES','EPERM','EBUSY'].includes(e.code)){console.log('F3C_LOCK_PROBE_OK');return}throw e}finally{if(fd!==undefined)fs.closeSync(fd)}throw Error('SQLITE_FREEZE_LOCK_UNAVAILABLE')}
 if(a[0]==='--run'&&a.length===4){const original=profile(a[1]),out=创建冻结副本(original,scope,a[2],a[3]);console.log('F3C_FROZEN '+out.manifest.文件.length);const r=验证影子(out.目录,()=>{assert.equal(准备冻结(original,scope).清单.清单指纹,a[3],'SOURCE_METADATA_CHANGED');for(const f of out.manifest.文件){const roots=original.根.filter(r=>r.路径&&(f.路径===r.域||f.路径.startsWith(r.域+'/')));assert.equal(roots.length,1);assert.equal(hash(fs.readFileSync(path.join(roots[0].路径,f.路径.slice(roots[0].域.length)))),f.sha256,'SOURCE_HASH_CHANGED')}});console.log(JSON.stringify({好:r.好,冻结文件:r.源文件数,逐字节文档:r.原格式逐字节文档数,外部文件:r.外部逐字节文件数,报告:path.join(out.根,'report.json')}));return}
 if(a[0]==='--replay'&&a.length===2){const r=验证影子(a[1]);console.log(JSON.stringify({好:r.好,报告:path.join(path.dirname(a[1]),'report.json')}));return}
 throw Error('SQLITE_FREEZE_USAGE')
}
if(require.main===module)try{main(process.argv.slice(2))}catch(e){console.error(JSON.stringify({好:false,阶段:e.phase??'freeze',代码:/^(SQLITE|SHADOW|WORK|MESSAGE|LONG|TEMP|PROMOTION|ATTACHMENT)_[A-Z_]+$/u.test(e.message)?e.message:'SQLITE_SHADOW_REHEARSAL_REJECTED',隔离目录:e.隔离目录??null}));process.exitCode=1}
module.exports={main,验证影子,references}
