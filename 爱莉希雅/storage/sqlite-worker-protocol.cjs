/** 纯协议：无SQL/文件/执行能力。D1补记忆/日记明确命令，核心接线仍后置。 */
'use strict'
const {createHash}=require('node:crypto'),{纯数据}=require('./sqlite-state.cjs')
const MAX_INPUT=65536,MAX_RESULT=262144,MAX_LOG=1048576,MAX_RECEIPTS=2048
const REGISTRY=Object.freeze({
 '状态.打开后端':[false,1], '状态.读取快照':[false,1], '状态.读取片段':[false,1], '状态.关闭后端':[false,1], '状态.保存快照组':[true,1],
 '状态.开始分段':[false,1], '状态.写入分段':[false,1], '状态.取消分段':[false,1], '状态.提交分段':[true,1],
 '状态.读取图谱记忆页':[false,1], '状态.提交图谱分段':[true,1],
 '会话.登记对话':[true,2], '会话.更新对话':[true,2], '会话.存对话一轮':[true,1], '会话.存对话记忆一轮':[true,1],
 '轮次执行.预留':[true,1], '轮次执行.标记可能发送':[true,1], '轮次执行.标记未知':[true,1], '轮次执行.暂存结果':[true,1], '轮次执行.模拟完成':[true,1], '轮次执行.读取':[false,1], '轮次执行.取暂存结果':[false,1],
 '模型事务.开始':[true,1], '模型事务.成功':[true,1], '模型事务.未知':[true,1],
 '模型事务.提交聊天':[true,1],
 '备份.虚构轮次快照':[false,1],
 '会话.读取对话':[false,1], '会话.列对话':[false,1], '会话.读消息页':[false,1], '会话.读最近聊天':[false,2], '会话.取统计':[false,0],
 '记忆.取统计':[false,0], '记忆.列长期':[false,1], '日记.读取共享':[false,0],
 '记忆.新增临时':[true,1], '记忆.评估并晋升':[true,1], '记忆.人工处理临时':[true,1], '记忆.人工确认晋升':[true,1],
 '记忆.新增长期':[true,1], '记忆.人工修改长期':[true,1], '记忆.人工遗忘长期':[true,1],
 '记忆.读取临时':[false,1], '记忆.查询临时':[false,1],
 '日记.写入共享':[true,1], '日记.修改共享':[true,1], '日记.删除共享':[true,1], '日记.导出共享':[false,0],
 '日记.写入私密':[true,1,true], '日记.删除私密':[true,2,true], '日记.记录私密评估':[true,1,true],
 '日记.读取本机私密':[false,1,true], '日记.读取本机评估':[false,1,true],
 '旧格式.读最早历史页':[false,1], '旧格式.读消息页':[false,1],
})
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex')
function fail(c){throw Error('SQLITE_WORKER_'+c)}
function exact(o,keys){if(!o||Object.getPrototypeOf(o)!==Object.prototype||Object.keys(o).sort().join(',')!==keys.slice().sort().join(','))fail('PROTOCOL_INVALID')}
function stable(x){return Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x}
function fingerprint(q){
 if(q.操作==='状态.提交图谱分段'){
  const b=q.参数[0];exact(b,['上传','写入','记忆版本']);if(!Array.isArray(b.写入)||!b.写入.length||b.写入.length>16||!Number.isSafeInteger(b.记忆版本)||b.记忆版本<0)fail('PROTOCOL_INVALID')
  const writes=b.写入.map(x=>{exact(x,['令牌','类型','编号','预期版本','字节数','指纹']);const {令牌,...business}=x;return business})
  return hash(stable({操作:q.操作,参数:[{写入:writes,记忆版本:b.记忆版本}]}))
 }
 if(q.操作==='状态.提交分段'){
  const b=q.参数[0];exact(b,['上传','写入']);if(!Array.isArray(b.写入)||!b.写入.length||b.写入.length>16)fail('PROTOCOL_INVALID')
  const writes=b.写入.map(x=>{exact(x,['令牌','类型','编号','预期版本','字节数','指纹']);const {令牌,...business}=x;return business})
  return hash(stable({操作:q.操作,参数:[{写入:writes}]}))
 }
 if(q.操作!=='状态.保存快照组')return hash(stable({操作:q.操作,参数:q.参数}))
 const b=q.参数[0];exact(b,['写入']);if(!Array.isArray(b.写入)||!b.写入.length||b.写入.length>16)fail('PROTOCOL_INVALID')
 const writes=b.写入.map(x=>{exact(x,['令牌','类型','编号','预期版本','数据']);const {令牌,...business}=x;return business})
 // 短期能力必须先在Worker授权；稳定业务指纹不含跨代必变的租约令牌。
 return hash(stable({操作:q.操作,参数:[{写入:writes}]}))
}
function command(input){const q=纯数据(input);if(Buffer.byteLength(JSON.stringify(q))>MAX_INPUT)fail('INPUT_LIMIT');const spec=Object.hasOwn(REGISTRY,q.操作)?REGISTRY[q.操作]:null;if(!spec)fail('OPERATION_FORBIDDEN');exact(q,spec[0]?['操作','参数','操作编号']:['操作','参数']);if(!Array.isArray(q.参数)||q.参数.length!==spec[1])fail('PROTOCOL_INVALID');if(spec[0]&&(typeof q.操作编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(q.操作编号)))fail('ID_INVALID');if(spec[0]&&(q.操作.startsWith('记忆.')||q.操作==='会话.存对话记忆一轮'||q.操作==='模型事务.提交聊天')&&q.参数[0]?.操作编号!==q.操作编号)fail('ID_MISMATCH');return{q,write:spec[0],private:spec[2]===true,bytes:Buffer.byteLength(JSON.stringify(q)),digest:fingerprint(q)}}
function authorize(c,options){if((c.q.操作.startsWith('轮次执行.')||c.q.操作.startsWith('模型事务.')||c.q.操作==='备份.虚构轮次快照')&&options.用途!=='synthetic-turn-disk-v3')fail('TURN_SCOPE_REQUIRED');if(!c.private)return;if(options.用途!=='isolated-local-sqlite-disk'||options.包含私密!==true)fail('PRIVATE_SCOPE_REQUIRED');const at=c.q.操作==='日记.删除私密'?1:['日记.读取本机私密','日记.读取本机评估'].includes(c.q.操作)?0:null;if(at!==null){const s=c.q.参数[at];exact(s,['用途']);if(s.用途!=='local-private-diary')fail('PRIVATE_SCOPE_REQUIRED')}}
function result(x){const r=纯数据({值:x}).值;if(Buffer.byteLength(JSON.stringify(r))>MAX_RESULT)fail('RESULT_LIMIT');return r}
function makeLog(rows){const body={版本:1,回执:rows};const out={...body,指纹:hash(body)};if(rows.length>MAX_RECEIPTS||Buffer.byteLength(JSON.stringify(out))>MAX_LOG)fail('JOURNAL_FULL');return out}
function validateLog(x){x=纯数据(x);exact(x,['版本','回执','指纹']);if(x.版本!==1||!Array.isArray(x.回执)||x.回执.length>MAX_RECEIPTS||Buffer.byteLength(JSON.stringify(x))>MAX_LOG||x.指纹!==hash({版本:x.版本,回执:x.回执}))fail('JOURNAL_INVALID');const seen=new Set();for(const r of x.回执){exact(r,['编号','指纹','结果']);if(typeof r.编号!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/u.test(r.编号)||seen.has(r.编号)||typeof r.指纹!=='string'||!/^[a-f0-9]{64}$/u.test(r.指纹)||r.结果?.好!==true)fail('JOURNAL_INVALID');seen.add(r.编号);result(r.结果)}return x}
module.exports={REGISTRY,MAX_INPUT,MAX_RESULT,MAX_LOG,MAX_RECEIPTS,command,authorize,result,makeLog,validateLog,hash,exact,fail}
