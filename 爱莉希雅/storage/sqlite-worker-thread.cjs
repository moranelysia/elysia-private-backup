/** 只在专用Worker运行；单条同步命令、单连接，无模型/网络/任意SQL接口。 */
'use strict'
const {isMainThread,parentPort,workerData}=require('node:worker_threads')
const {打开隔离盘库}=require('./sqlite-disk.cjs'),{内部备份测试}=require('./sqlite-backup.cjs'),{取内部,原子执行}=require('./sqlite-context.cjs')
const P=require('./sqlite-worker-protocol.cjs'),{创建Worker状态命令}=require('./sqlite-worker-state.cjs')
if(isMainThread||!parentPort)P.fail('THREAD_REQUIRED')
let d,store,i,ctx,state,active,closing=false
const code=e=>/^SQLITE_[A-Z_]+$/u.test(e?.message||'')?e.message:'SQLITE_WORKER_REJECTED'
function log(){return P.validateLog(JSON.parse(i.db.prepare("SELECT value FROM repository_meta WHERE key='disk_worker_receipts'").get().value))}
function writeLog(x){i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(x))}
function stop(){if(closing)return;closing=true;try{d?.关闭()}catch{}parentPort.close()}
try{
 P.exact(workerData,['options','owner']);d=打开隔离盘库(workerData.options,workerData.owner);store=d.仓储;i=内部备份测试(store);ctx=i.上下文;state=创建Worker状态命令(ctx)
 if(!i.db.prepare("SELECT 1 FROM repository_meta WHERE key='disk_worker_receipts'").get())原子执行(ctx,()=>{i.db.prepare("UPDATE repository_meta SET value='2' WHERE key='disk_storage_format'").run();writeLog(P.makeLog([]))})
 const before=取内部(ctx).提交前
 取内部(ctx).提交前=value=>{try{before(value);if(active){const r=P.result(value);if(!r||r.好!==true)P.fail('RESULT_INVALID');const l=log();if(l.回执.some(x=>x.编号===active.q.操作编号))P.fail('JOURNAL_INVALID');writeLog(P.makeLog([...l.回执,{编号:active.q.操作编号,指纹:active.digest,结果:r}]));active.committedResult=r}}catch(e){if(active)active.fault=code(e);throw e}}
 parentPort.on('message',message=>{if(closing)return;let id=message?.id;try{P.exact(message,['id','type','data']);if(typeof id!=='string'||id.length>100)P.fail('PROTOCOL_INVALID');if(message.type==='close'){stop();return}if(message.type==='receipt'){const q=message.data;P.exact(q,['编号']);if(typeof q.编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(q.编号))P.fail('ID_INVALID');parentPort.postMessage({id,type:'result',value:log().回执.find(x=>x.编号===q.编号)??null});return}if(message.type!=='command')P.fail('PROTOCOL_INVALID');const c=P.command(message.data)
   P.authorize(c,workerData.options);state.授权(c)
   if(c.write){const old=log().回执.find(x=>x.编号===c.q.操作编号);if(old){if(old.指纹!==c.digest)P.fail('ID_CONFLICT');parentPort.postMessage({id,type:'result',value:old.结果});return}active=c}
   const [group,name]=c.q.操作.split('.'),r=P.result((group==='状态'?state:store[group])[name](...c.q.参数))
   if(c.write){if(r?.好!==true)throw Error(active.fault??r?.代码??'SQLITE_WORKER_BUSINESS_REJECTED');if(!active.committedResult||JSON.stringify(r)!==JSON.stringify(active.committedResult))P.fail('RESULT_UNCERTAIN')}
   parentPort.postMessage({id,type:'result',value:r})
  }catch(e){const fatal=d?.取状态().可用===false||e.message==='SQLITE_WORKER_RESULT_UNCERTAIN';parentPort.postMessage({id,type:fatal?'fatal':'error',code:code(e)});if(fatal)stop()}finally{active=undefined}})
 parentPort.on('close',()=>{try{d?.关闭()}catch{}});parentPort.postMessage({type:'ready',sqlite:d.取状态().sqlite})
}catch(e){parentPort.postMessage({type:'boot-error',code:code(e)});stop()}
