/** Synthetic fake-channel core with durable model binding; not a production entry point. */
'use strict'
const { createHash } = require('node:crypto')
const { 校验接收消息 } = require('../脑/渠道契约.cjs')
const { 等待有界 } = require('../脑/任务控制.cjs')
const { 创建异步仓储门面 } = require('../storage/sqlite-async-facade.cjs')
const { 纯数据 } = require('../storage/sqlite-state.cjs')
const { 是隔离输出标记 } = require('./隔离输出标记.cjs')
const { 隔离消息身份 } = require('./异步假对话核心.cjs')
const { 领取隔离绑定调度 } = require('./隔离一次性假发送.cjs')
const fail = code => { throw Error('BOUND_CORE_' + code) }
const sha = s => createHash('sha256').update(s,'utf8').digest('hex')
function 创建隔离绑定对话核心({ actor, 调度器, 模型, 拼提示, 输出标记, 取现在 = () => new Date() } = {}) {
  if (!['deepseek-flash','deepseek-v4-pro'].includes(模型) || typeof 拼提示 !== 'function' || typeof 取现在 !== 'function' || !是隔离输出标记(输出标记)) fail('DEPENDENCY_INVALID')
  const broker=领取隔离绑定调度(调度器,actor), f=创建异步仓储门面(actor), abort=new AbortController(), pending=new Set();let closed=false,closing=null,tail=Promise.resolve(),fault=false
  function check(signal){if(closed||signal.aborted)fail('ABORTED');if(fault)fail('UNCERTAIN')}
  function now(){const d=取现在();if(!(d instanceof Date)||!Number.isFinite(d.getTime()))fail('CLOCK_INVALID');return d.toISOString()}
  async function readHistory(id){const rows=[];let cursor=null;for(let i=0;i<2;i++){const p=await f.旧格式.读消息页({对话:id,大小:200,游标:cursor});rows.unshift(...p.消息.map(x=>x.原始));cursor=p.下一页;if(!cursor)break}return rows.filter(x=>x&&['user','assistant'].includes(x.角色)&&typeof x.内容==='string').map(x=>({role:x.角色,content:x.内容,时间:typeof x.时间==='string'?x.时间:''}))}
  async function usageVersion(){const backend=await f.状态.打开后端('usage','headless');try{return(await backend.读取分段快照()).版本}finally{await backend.关闭()}}
  async function duplicate(conversation,id,receipt){
    const wanted=receipt?.结果?.消息编号;if(!Array.isArray(wanted)||wanted.length!==2)fail('RECEIPT_INVALID')
    if(receipt.结果.记忆?.状态==='committed'){const session=await f.会话.读取对话(conversation);if(!session||!session.写长期记忆)fail('MEMORY_SWITCH_OFF')}
    let cursor=null,user,assistant
    for(let i=0;i<20;i++){const p=await f.旧格式.读消息页({对话:conversation,大小:200,游标:cursor});for(const x of p.消息)if(x.来源==='native'){if(x.内部定位===wanted[0])user=x.原始;if(x.内部定位===wanted[1])assistant=x.原始}if(user&&assistant)break;cursor=p.下一页;if(!cursor)break}
    if(!user||!assistant||user.轮次!==id.turn||assistant.轮次!==id.turn||user.角色!=='user'||assistant.角色!=='assistant'||typeof assistant.内容!=='string')fail('RECEIPT_INVALID')
    return {可见性:'shared',正文:assistant.内容,附件:[]}
  }
  async function run(msg,ctx){
    const signal=ctx.中止?AbortSignal.any([abort.signal,ctx.中止]):abort.signal;check(signal)
    const id=隔离消息身份(msg,ctx.内部对话编号), fingerprint=sha(JSON.stringify([msg.发生于,msg.回复消息编号,msg.正文,msg.附件])), conversation=ctx.内部对话编号
    let attempt=await f.轮次执行.读取(id.operation);check(signal)
    if(attempt&&(attempt.指纹!==fingerprint||attempt.模型!==模型))fail('IDENTITY_CONFLICT')
    let binding=attempt?await f.模型事务.读取聊天绑定(id.operation):null;check(signal)
    if(attempt&&(!binding||binding.对话!==conversation||binding.聊天轮次!==id.turn||binding.指纹!==fingerprint||binding.请求编号!==attempt.请求编号))fail('BINDING_CONFLICT')
    const receipt=await actor.查询回执(id.operation);check(signal)
    if(attempt?.状态==='committed'){if(!receipt||receipt.结果?.轮次执行?.请求编号!==attempt.请求编号)fail('RECEIPT_INVALID');const out=await duplicate(conversation,id,receipt);check(signal);return out}
    if(receipt)fail('RECEIPT_INVALID')
    if(attempt&&attempt.状态!=='result_ready')fail('UNRESOLVED')
    if(!attempt){
      const session=await f.会话.读取对话(conversation), memory=await f.记忆.取统计();check(signal);if(!session)fail('SESSION_REQUIRED')
      const history=await readHistory(conversation);check(signal);if(Buffer.byteLength(JSON.stringify(history))>131072)fail('HISTORY_LIMIT')
      const prompts=纯数据({消息:await 等待有界(Promise.resolve().then(()=>拼提示(纯数据({历史:history,输入:msg.正文}))),signal)}).消息;check(signal)
      if(!Array.isArray(prompts)||prompts.length<1||prompts.length>402||prompts.some(x=>!x||Object.keys(x).sort().join(',')!=='content,role'||!['system','user','assistant'].includes(x.role)||typeof x.content!=='string')||Buffer.byteLength(JSON.stringify(prompts))>131072)fail('PROMPT_INVALID')
      const version=await usageVersion();check(signal)
      const answer=await broker.要一轮({轮次键:id.operation,指纹:fingerprint,模型,预期用量版本:version,绑定:{对话:conversation,聊天轮次:id.turn,预期会话版本:session.元数据版本,预期记忆版本:memory.版本},消息们:prompts,中止:signal});check(signal)
      attempt=await f.轮次执行.读取(id.operation);binding=await f.模型事务.读取聊天绑定(id.operation);check(signal)
      if(!attempt||attempt.状态!=='result_ready'||attempt.请求编号!==answer.请求编号||!binding||binding.对话!==conversation||binding.聊天轮次!==id.turn||binding.指纹!==fingerprint||binding.请求编号!==attempt.请求编号)fail('BINDING_CONFLICT')
    }
    const raw=await f.轮次执行.取暂存结果(id.operation);check(signal)
    const parsed=纯数据(输出标记.解析(raw));check(signal)
    const q={操作编号:id.operation,轮次键:id.operation,指纹:fingerprint,请求编号:attempt.请求编号,模型,预期轮次版本:attempt.版本,结果摘要:sha(raw),轮:{对话:conversation,轮次:id.turn,用户正文:msg.正文,回复正文:parsed.正文,发生于:msg.发生于,接收于:msg.接收于,完成于:now()},预期会话版本:binding.预期会话版本,预期记忆版本:binding.预期记忆版本,标记:parsed.标记}
    const saved=await broker.提交绑定聊天(q,signal);check(signal);if(!saved?.好||saved.轮次执行?.请求编号!==attempt.请求编号)fail('RECEIPT_INVALID')
    return {可见性:'shared',正文:parsed.正文,附件:[]}
  }
  async function 处理(input,ctx){
    check(abort.signal);const msg=校验接收消息(input)
    if(msg.端点.渠道!=='fake'||msg.附件.length||!ctx||Object.getPrototypeOf(ctx)!==Object.prototype||typeof ctx.内部对话编号!=='string'||!/^channel-[a-zA-Z0-9_-]{1,100}$/u.test(ctx.内部对话编号)||Object.keys(ctx).some(k=>!['内部对话编号','中止'].includes(k))||(ctx.中止!==undefined&&!(ctx.中止 instanceof AbortSignal)))fail('INPUT_INVALID')
    if(pending.size>=32)fail('QUEUE_FULL');const context={内部对话编号:ctx.内部对话编号,中止:ctx.中止}
    const task=tail.then(async()=>{try{return await run(msg,context)}catch(e){if(e.状态==='unknown'||e.状态==='interrupted'||/^SYNTHETIC_SEND_/u.test(e.message))fault=true;throw e}});pending.add(task);tail=task.catch(()=>{});try{return await task}finally{pending.delete(task)}
  }
  function 关闭(){if(!closing){closed=true;abort.abort();closing=Promise.allSettled([...pending]).then(()=>broker.关闭())}return closing}
  return Object.freeze({处理,关闭})
}
module.exports={创建隔离绑定对话核心}
