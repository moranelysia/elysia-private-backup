/** Explicit synthetic-only background extraction; no timer and no production entry point. */
'use strict'
const {createHash}=require('node:crypto'),{创建异步仓储门面}=require('../storage/sqlite-async-facade.cjs'),{纯数据}=require('../storage/sqlite-state.cjs'),{校验隔离后台调度}=require('./隔离一次性假发送.cjs'),{校验后台缓冲}=require('./后台缓冲格式.cjs'),提取=require('../脑/临时记忆提取.cjs'),临时状态=require('../脑/临时记忆状态.cjs'),自评=require('../脑/临时记忆自主评估.cjs')
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x),'utf8').digest('hex'),fail=c=>{throw Error('ASYNC_EXTRACTION_'+c)}
function 创建隔离异步记忆提取({actor,调度器,模型,取现在=()=>new Date()}={}){
 if(!['deepseek-flash','deepseek-v4-pro'].includes(模型)||typeof 取现在!=='function')fail('DEPENDENCY_INVALID')
 const broker=校验隔离后台调度(调度器,actor),f=创建异步仓储门面(actor),abort=new AbortController();let closed=false,active=null
 function now(){const d=取现在();if(!(d instanceof Date)||!Number.isFinite(d.getTime()))fail('CLOCK_INVALID');return d}
 async function readBuffer(){const b=await f.状态.打开后端('extraction-buffer','main');try{const s=await b.读取分段快照(),data=s.数据??{版本:1,轮次:[]};校验后台缓冲(data);return data}finally{await b.关闭()}}
 async function usageVersion(){const b=await f.状态.打开后端('usage','headless');try{return(await b.读取分段快照()).版本}finally{await b.关闭()}}
 function select(rows,clock){for(const item of rows){const group=rows.filter(x=>x.对话===item.对话);if(group.length>=3||Date.parse(group[0].接收于)+300000<=clock.getTime())return group.slice(0,3)}return []}
 async function execute(signal){const buffer=await readBuffer(),batch=select(buffer.轮次,now());if(!batch.length)return{好:true,状态:'waiting'}
  if(batch.some(x=>typeof x.内部消息编号!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(x.内部消息编号)))fail('SOURCE_UNAVAILABLE')
  const ids=batch.map(x=>x.内部消息编号), key='extract-'+hash(ids),fingerprint=hash(batch),conversation=batch[0].对话,session=await f.会话.读取对话(conversation);if(!session||!session.写长期记忆)fail('MEMORY_SWITCH_OFF')
  let attempt=await f.轮次执行.读取(key),binding=attempt?await f.模型事务.读取聊天绑定(key):null;if(attempt&&(attempt.指纹!==fingerprint||attempt.模型!==模型||!binding||binding.对话!==conversation||binding.聊天轮次!==key))fail('IDENTITY_CONFLICT')
  if(attempt&&attempt.状态!=='result_ready')fail('UNRESOLVED')
  const before=await f.记忆.取统计(),existing=await f.记忆.查询临时({生命周期:'有效',限量:50}),archived=await f.记忆.查询临时({生命周期:'已归档',确认状态:'待确认',限量:1000});if(existing.版本!==before.版本||archived.版本!==before.版本)fail('MEMORY_CONFLICT')
  if(!attempt){const dialogue=batch.map((r,i)=>({轮次:i+1,用户原话:r.用户原话.trim(),最终回复:r.她的回复.trim(),消息时间:r.消息时间})),known=existing.列表.filter(r=>r.确认状态==='已确认'&&(!r.关系||r.关系.状态==='当前')).slice(0,30).map(r=>({编号:r.编号,类别:r.类别,记忆类型:r.记忆类型,人物:r.元数据?.person,内容:String(r.内容||'').slice(0,300)})),messages=[{role:'system',content:提取.后台提取系统提示},{role:'user',content:JSON.stringify({本批对话:dialogue,...(dialogue.length===1?{本轮用户原话:dialogue[0].用户原话,本轮最终回复:dialogue[0].最终回复}:{}),已有临时候选_避免重复:known})}],version=await usageVersion();if(signal.aborted)fail('ABORTED')
   const reply=await broker.要一轮({轮次键:key,指纹:fingerprint,模型,预期用量版本:version,绑定:{对话:conversation,聊天轮次:key,预期会话版本:session.元数据版本,预期记忆版本:before.版本,预期消息数:session.条数},消息们:messages,中止:signal});if(signal.aborted)fail('ABORTED');attempt=await f.轮次执行.读取(key);binding=await f.模型事务.读取聊天绑定(key);if(!attempt||attempt.状态!=='result_ready'||attempt.请求编号!==reply.请求编号||!binding||binding.指纹!==fingerprint)fail('IDENTITY_CONFLICT')
  }
  if(before.版本!==binding.预期记忆版本)fail('MEMORY_CONFLICT')
  const evidence=batch.map(x=>({对话:conversation,用户原话:x.用户原话,消息时间:x.消息时间})),reevaluate=[];for(const old of [...existing.列表,...archived.列表]){if(old.确认状态!=='待确认'||(old.关系&&old.关系.状态!=='当前'))continue;const evaluation=自评.评估({候选:old,对话轮次:evidence,已有记录:existing.列表.filter(x=>x.编号!==old.编号),既有提及:old.生命周期==='已归档'&&!old.评估账本?1:0,来源对话:conversation});if(evaluation.新增提及次数)reevaluate.push(old.编号)}
  const known=[...existing.列表,...archived.列表.filter(x=>reevaluate.includes(x.编号))],raw=await f.轮次执行.取暂存结果(key),parsed=提取.解析JSON(raw),candidate=提取.规整候选(parsed,{对话轮次:batch,已有内容:known.map(x=>x.内容),已有记录:known,临时记忆库:临时状态})
  const payload=candidate.map(c=>({类别:c.类别,内容:c.内容,依据原文:c.依据原文,依据轮次:c.依据轮次,保留天数:c.保留天数,标签:c.标签,记忆类型:c.记忆类型,元数据:c.元数据,替代编号:c.替代编号}))
  if(signal.aborted)fail('ABORTED');const result=await broker.提交后台提取({操作编号:'bg-apply-'+hash(ids),轮次键:key,指纹:fingerprint,请求编号:attempt.请求编号,模型,预期轮次版本:attempt.版本,结果摘要:hash(raw),对话:conversation,批次:ids,候选:payload,复评:reevaluate},signal);if(signal.aborted)fail('ABORTED');return {好:true,状态:'processed',批次轮数:batch.length,候选数:payload.length,新增:result.新增,复评:result.复评,晋升:result.晋升}
 }
 function 推进(){if(closed)fail('CLOSED');if(active)fail('BUSY');const p=execute(abort.signal);active=p;void p.finally(()=>{if(active===p)active=null}).catch(()=>{});return p}
 function 关闭(){closed=true;abort.abort();return Promise.resolve(active).catch(()=>{})}
 return Object.freeze({推进,关闭})
}
module.exports={创建隔离异步记忆提取}
