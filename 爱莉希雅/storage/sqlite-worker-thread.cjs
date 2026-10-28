/** 只在专用Worker运行；单条同步命令、单连接，无模型/网络/任意SQL接口。 */
'use strict'
const {isMainThread,parentPort,workerData}=require('node:worker_threads')
const {打开隔离盘库}=require('./sqlite-disk.cjs'),{内部备份测试}=require('./sqlite-backup.cjs'),{取内部,原子执行}=require('./sqlite-context.cjs')
const P=require('./sqlite-worker-protocol.cjs'),{创建Worker状态命令}=require('./sqlite-worker-state.cjs')
const {创建组合轮次}=require('./sqlite-combined-turn.cjs')
const {创建隔离内存轮次执行仓储,内部事务轮次执行}=require('./sqlite-turn-attempt-memory.cjs')
const {创建虚构轮次快照}=require('./sqlite-turn-snapshot.cjs')
const {创建虚构分段快照}=require('./sqlite-segmented-snapshot.cjs')
const {创建虚构模型组合事务}=require('./sqlite-model-turn-usage.cjs')
const {创建虚构模型聊天提交}=require('./sqlite-model-chat-commit.cjs')
const {创建虚构聊天绑定}=require('./sqlite-model-chat-binding.cjs')
const {创建虚构后台提交}=require('./sqlite-background-model-commit.cjs')
const segmented=require('./sqlite-segmented-receipts.cjs')
const {内部状态操作}=require('./sqlite-state.cjs')
if(isMainThread||!parentPort)P.fail('THREAD_REQUIRED')
let d,store,i,ctx,state,combined,turn,modelTx,modelChat,background,binding,active,closing=false
const code=e=>/^SQLITE_[A-Z_]+$/u.test(e?.message||'')?e.message:'SQLITE_WORKER_REJECTED'
function log(){return P.validateLog(JSON.parse(i.db.prepare("SELECT value FROM repository_meta WHERE key='disk_worker_receipts'").get().value))}
function lookup(id){return workerData.options.用途==='synthetic-turn-disk-v4'?segmented.查找(i.db,id):log().回执.find(x=>x.编号===id)??null}
function capacity(){const h=i.db.prepare('SELECT segment_count,receipt_count FROM synthetic_receipt_head WHERE id=1').get(),attempts=i.db.prepare('SELECT count(*) AS n FROM synthetic_turn_attempts').get().n,bindings=i.db.prepare("SELECT count(*) AS n FROM repository_meta WHERE key GLOB 'synthetic_chat_binding_*'").get().n,state=内部状态操作(ctx),usage=state.读(i.db,'usage','headless').数据,buffer=state.读(i.db,'extraction-buffer','main').数据;const values={回执段:{数量:h.segment_count,上限:segmented.最大段数},轮次:{数量:attempts,上限:10000},聊天绑定:{数量:bindings,上限:2048},用量事件:{数量:Array.isArray(usage)?usage.length:0,上限:10000},后台缓冲:{数量:buffer?.轮次?.length??0,上限:100}};for(const v of Object.values(values))v.状态=v.数量>=v.上限?'已满':v.数量/v.上限>=0.8?'接近上限':'正常';return {版本:1,回执数:h.receipt_count,项目:values}}
function writeLog(x){i.db.prepare("INSERT INTO repository_meta(key,value) VALUES('disk_worker_receipts',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(x))}
function stop(){if(closing)return;closing=true;try{d?.关闭()}catch{}parentPort.close()}
try{
 P.exact(workerData,['options','owner']);d=打开隔离盘库(workerData.options,workerData.owner);store=d.仓储;i=内部备份测试(store);ctx=i.上下文;state=创建Worker状态命令(ctx);combined=创建组合轮次(ctx);if(['synthetic-turn-disk-v3','synthetic-turn-disk-v4'].includes(workerData.options.用途)){turn=创建隔离内存轮次执行仓储(ctx);binding=创建虚构聊天绑定(ctx,turn);modelTx=创建虚构模型组合事务(ctx,turn,binding);modelChat=创建虚构模型聊天提交(ctx,turn,binding);if(workerData.options.用途==='synthetic-turn-disk-v4')background=创建虚构后台提交(ctx,turn,binding)}
 if(workerData.options.用途!=='synthetic-turn-disk-v4'&&!i.db.prepare("SELECT 1 FROM repository_meta WHERE key='disk_worker_receipts'").get())原子执行(ctx,()=>{i.db.prepare("UPDATE repository_meta SET value='2' WHERE key='disk_storage_format'").run();writeLog(P.makeLog([]))})
 const before=取内部(ctx).提交前
 取内部(ctx).提交前=value=>{try{before(value);if(active){const r=P.result(value);if(!r||r.好!==true)P.fail('RESULT_INVALID');const entry={编号:active.q.操作编号,指纹:active.digest,结果:r};if(workerData.options.用途==='synthetic-turn-disk-v4')segmented.事务追加(i.db,entry);else{const l=log();if(l.回执.some(x=>x.编号===entry.编号))P.fail('JOURNAL_INVALID');writeLog(P.makeLog([...l.回执,entry]))}active.committedResult=r}}catch(e){if(active)active.fault=code(e);throw e}}
 parentPort.on('message',message=>{if(closing)return;let id=message?.id;try{P.exact(message,['id','type','data']);if(typeof id!=='string'||id.length>100)P.fail('PROTOCOL_INVALID');if(message.type==='close'){stop();return}if(message.type==='receipt'){const q=message.data;P.exact(q,['编号']);if(typeof q.编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(q.编号))P.fail('ID_INVALID');parentPort.postMessage({id,type:'result',value:lookup(q.编号)});return}if(message.type!=='command')P.fail('PROTOCOL_INVALID');const c=P.command(message.data)
   P.authorize(c,workerData.options);if(c.q.操作!=='状态.虚构分段容量')state.授权(c)
   if(c.write&&['synthetic-turn-disk-v3','synthetic-turn-disk-v4'].includes(workerData.options.用途)&&i.db.prepare("SELECT value FROM repository_meta WHERE key='synthetic_restore_fence'").get())P.fail('RESTORE_QUARANTINED')
   if(c.write){const old=lookup(c.q.操作编号);if(old){if(old.指纹!==c.digest)P.fail('ID_CONFLICT');if(((c.q.操作==='会话.存对话记忆一轮'||c.q.操作==='模型事务.提交聊天'||c.q.操作==='模型事务.提交绑定聊天')&&(old.结果?.记忆?.状态==='committed'||old.结果?.后台?.状态==='saved'))||c.q.操作==='模型事务.提交后台提取'){const session=store.会话.读取对话(c.q.操作==='模型事务.提交后台提取'?c.q.参数[0]?.对话:c.q.参数[0]?.轮?.对话);if(!session||session.写长期记忆!==true)throw Error('SQLITE_MEMORY_SWITCH_OFF')}parentPort.postMessage({id,type:'result',value:(c.q.操作.startsWith('轮次执行.')||c.q.操作.startsWith('模型事务.'))?{...old.结果,回放:true}:old.结果});return}active=c}
   const [group,name]=c.q.操作.split('.'),r=P.result(c.q.操作==='状态.虚构分段容量'?capacity():c.q.操作==='备份.虚构轮次快照'?创建虚构轮次快照(store,log(),...c.q.参数):c.q.操作==='备份.虚构分段快照'?创建虚构分段快照(store,...c.q.参数):c.q.操作==='模型事务.读取聊天绑定'?binding.读取(...c.q.参数):c.q.操作==='模型事务.提交绑定聊天'?modelChat(c.q.参数[0],true):c.q.操作==='模型事务.提交后台提取'?background(...c.q.参数):c.q.操作==='模型事务.提交聊天'?modelChat(...c.q.参数):group==='模型事务'?modelTx[name](...c.q.参数):group==='轮次执行'?(c.write?原子执行(ctx,()=>({好:true,回放:false,...内部事务轮次执行(ctx,name,c.q.参数[0])})):turn[name](...c.q.参数)):c.q.操作==='会话.存对话记忆一轮'?combined(...c.q.参数):(group==='状态'?state:store[group])[name](...c.q.参数))
   if(c.write){if(r?.好!==true)throw Error(active.fault??r?.代码??'SQLITE_WORKER_BUSINESS_REJECTED');if(!active.committedResult||JSON.stringify(r)!==JSON.stringify(active.committedResult))P.fail('RESULT_UNCERTAIN')}
   parentPort.postMessage({id,type:'result',value:r})
  }catch(e){const fatal=d?.取状态().可用===false||e.message==='SQLITE_WORKER_RESULT_UNCERTAIN';parentPort.postMessage({id,type:fatal?'fatal':'error',code:code(e)});if(fatal)stop()}finally{active=undefined}})
 parentPort.on('close',()=>{try{d?.关闭()}catch{}});parentPort.postMessage({type:'ready',sqlite:d.取状态().sqlite})
}catch(e){parentPort.postMessage({type:'boot-error',code:code(e)});stop()}
