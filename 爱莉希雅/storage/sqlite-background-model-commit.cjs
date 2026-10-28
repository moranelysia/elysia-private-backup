/** Synthetic background batch commit; evidence, memories, buffer and model state share one transaction. */
'use strict'
const {createHash}=require('node:crypto'),{原子执行,取内部}=require('./sqlite-context.cjs'),{纯数据,内部状态操作}=require('./sqlite-state.cjs'),{exact}=require('./sqlite-worker-protocol.cjs'),{内部事务记忆操作}=require('./sqlite-memory.cjs'),{内部事务轮次执行}=require('./sqlite-turn-attempt-memory.cjs'),{校验后台缓冲}=require('../core/后台缓冲格式.cjs')
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x),'utf8').digest('hex'),fail=c=>{throw Error('SQLITE_STATE_BACKGROUND_'+c)}
function 创建虚构后台提交(ctx,turn,binding){const s=取内部(ctx);if(!s.磁盘||s.本机||!s.虚构轮次)fail('SCOPE_REQUIRED');const state=内部状态操作(ctx)
 return input=>{const x=纯数据(input);exact(x,['操作编号','轮次键','指纹','请求编号','模型','预期轮次版本','结果摘要','对话','批次','候选','复评','续做']);if(typeof x.操作编号!=='string'||!Array.isArray(x.批次)||x.批次.length<1||x.批次.length>3||new Set(x.批次).size!==x.批次.length||!Array.isArray(x.候选)||x.候选.length>3||!Array.isArray(x.复评)||x.复评.length>1050||new Set(x.复评).size!==x.复评.length||!Array.isArray(x.续做)||x.续做.length>50||new Set(x.续做).size!==x.续做.length||x.续做.some(id=>x.复评.includes(id))||typeof x.结果摘要!=='string'||!/^[a-f0-9]{64}$/u.test(x.结果摘要))fail('INPUT_INVALID')
  return 原子执行(ctx,db=>{const t=turn.读取(x.轮次键),b=binding.读取(x.轮次键);if(!t||!b||t.状态!=='result_ready'||t.版本!==x.预期轮次版本||t.指纹!==x.指纹||t.请求编号!==x.请求编号||t.模型!==x.模型||b.请求编号!==x.请求编号||b.对话!==x.对话||b.聊天轮次!==x.轮次键)fail('IDENTITY_CONFLICT');if(hash(turn.取暂存结果(x.轮次键))!==x.结果摘要)fail('RESULT_CONFLICT')
   const session=db.prepare('SELECT metadata_version,message_count,write_memory FROM chat_sessions WHERE conversation_id=?').get(x.对话);if(!session||session.write_memory!==1)fail('MEMORY_SWITCH_OFF');if(session.metadata_version!==b.预期会话版本||session.message_count!==b.预期消息数)fail('SESSION_CONFLICT')
   const current=Number(db.prepare("SELECT value FROM repository_meta WHERE key='memory_revision'").get()?.value);if(current!==b.预期记忆版本)fail('MEMORY_CONFLICT')
   const snap=state.读(db,'extraction-buffer','main'),data=snap.数据===null?{版本:1,轮次:[]}:纯数据(snap.数据);校验后台缓冲(data);const batch=x.批次.map(id=>{const matches=data.轮次.filter(r=>r.对话===x.对话&&r.内部消息编号===id);if(matches.length!==1)fail('BATCH_CONFLICT');const row=db.prepare('SELECT content,role,conversation_id FROM chat_messages WHERE message_id=?').get(id);if(!row||row.role!=='user'||row.conversation_id!==x.对话||row.content.slice(0,6000)!==matches[0].用户原话)fail('EVIDENCE_INVALID');return matches[0]});if(hash(batch)!==x.指纹)fail('BATCH_CONFLICT')
   if(!b.处理时间)fail('PROCESS_TIME_MISSING');const when=b.处理时间;let version=current,created=0,promoted=0,reevaluated=0
   if(x.复评.some(id=>{const row=db.prepare('SELECT lifecycle,expires_raw FROM memory_temporary WHERE memory_id=?').get(id);return row?.lifecycle==='有效'&&Date.parse(row.expires_raw)<=Date.parse(when)})){const archived=内部事务记忆操作(ctx,'人工处理临时',{操作编号:'bg-archive-'+hash(x.轮次键),时间:when,预期版本:version,动作:'归档到期',参数:[]});version=archived.版本}
   for(const id of x.续做){const resumed=内部事务记忆操作(ctx,'续做自主晋升',{操作编号:'bg-resume-'+hash([x.轮次键,id]),时间:when,预期版本:version,编号:id});version=resumed.版本;if(resumed.晋升)promoted++}
   for(const id of x.复评){const evaluated=内部事务记忆操作(ctx,'评估并晋升',{操作编号:'bg-existing-'+hash([x.轮次键,id]),时间:when,预期版本:version,编号:id,消息编号:x.批次});version=evaluated.版本;reevaluated++;if(evaluated.晋升)promoted++}
   for(let i=0;i<x.候选.length;i++){const c=x.候选[i];exact(c,['类别','内容','依据原文','依据轮次','保留天数','标签','记忆类型','元数据','替代编号']);if(!Number.isSafeInteger(c.依据轮次)||c.依据轮次<1||c.依据轮次>batch.length||typeof c.依据原文!=='string'||!c.依据原文||!batch[c.依据轮次-1].用户原话.includes(c.依据原文)||typeof c.替代编号!=='string')fail('EVIDENCE_INVALID');const input={操作编号:'bg-new-'+hash([x.轮次键,i]),时间:when,预期版本:version,类别:c.类别,内容:c.内容,细节:{记忆类型:c.记忆类型,元数据:c.元数据,标签:c.标签,保留天数:c.保留天数},来源消息编号:batch[c.依据轮次-1].内部消息编号,依据原文:c.依据原文},made=内部事务记忆操作(ctx,'新增临时',input);version=made.版本;created++
    if(c.替代编号){const changed=内部事务记忆操作(ctx,'人工处理临时',{操作编号:'bg-replace-'+hash([x.轮次键,i]),时间:when,预期版本:version,动作:'提议替代',参数:[made.临时编号,c.替代编号]});version=changed.版本}
    if(!c.替代编号){const evaluated=内部事务记忆操作(ctx,'评估并晋升',{操作编号:'bg-eval-'+hash([x.轮次键,i]),时间:when,预期版本:version,编号:made.临时编号,消息编号:x.批次});version=evaluated.版本;if(evaluated.晋升)promoted++}
   }
   const chosen=new Set(x.批次);data.轮次=data.轮次.filter(r=>!(r.对话===x.对话&&chosen.has(r.内部消息编号)));校验后台缓冲(data);const bufferVersion=state.写(db,'extraction-buffer','main',data,snap.版本),done=内部事务轮次执行(ctx,'模拟完成',{轮次键:x.轮次键,预期版本:x.预期轮次版本})
   return {好:true,状态:'committed',新增:created,复评:reevaluated,晋升:promoted,记忆版本:version,缓冲版本:bufferVersion,轮次执行:done,回放:false}
  })
 }
}
module.exports={创建虚构后台提交}
