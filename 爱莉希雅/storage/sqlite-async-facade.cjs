/** D1：显式异步门面，不伪装原同步后端；不拥有Worker生命周期。 */
'use strict'
const {创建异步状态接口}=require('./sqlite-async-state.cjs')
const {纯数据}=require('./sqlite-state.cjs'),{取Worker领域能力}=require('./sqlite-worker.cjs'),{exact}=require('./sqlite-worker-protocol.cjs')
function 创建异步仓储门面(actor,options={}){
 const capability=取Worker领域能力(actor),o=纯数据(options);if(Object.keys(o).some(k=>k!=='本机私密')||(Object.hasOwn(o,'本机私密')&&typeof o.本机私密!=='boolean'))throw Error('SQLITE_FACADE_SCOPE_REQUIRED');if(o.本机私密===true&&!capability.本机私密)throw Error('SQLITE_FACADE_PRIVATE_SCOPE_REQUIRED')
 const read=(操作,参数)=>actor.调用({操作,参数})
 function write(操作,参数,meta){const m=纯数据(meta);exact(m,['操作编号']);return actor.调用({操作,参数,操作编号:m.操作编号})}
 const 会话=Object.freeze({
  登记对话:async(id,value,meta)=>write('会话.登记对话',[id,value],meta),更新对话:async(id,value,meta)=>write('会话.更新对话',[id,value],meta),存对话一轮:async(value,meta)=>write('会话.存对话一轮',[value],meta),存对话记忆一轮:async(value)=>{const q=纯数据(value);return write('会话.存对话记忆一轮',[q],{操作编号:q.操作编号})},
  读取对话:async id=>read('会话.读取对话',[id]),列对话:async(q={})=>read('会话.列对话',[q]),读消息页:async q=>read('会话.读消息页',[q]),读最近聊天:async(n,q)=>read('会话.读最近聊天',[n,q]),取统计:async()=>read('会话.取统计',[]),
 })
 const 记忆={取统计:async()=>read('记忆.取统计',[]),列长期:async(q={})=>read('记忆.列长期',[q]),读取临时:async id=>read('记忆.读取临时',[id]),查询临时:async(q={})=>read('记忆.查询临时',[q])}
 for(const name of ['新增临时','评估并晋升','人工处理临时','人工确认晋升','新增长期','人工修改长期','人工遗忘长期'])记忆[name]=async input=>{const q=纯数据(input);return write('记忆.'+name,[q],{操作编号:q.操作编号})}
 const 日记={读取共享:async()=>read('日记.读取共享',[]),导出共享:async()=>read('日记.导出共享',[])}
 for(const name of ['写入共享','修改共享','删除共享'])日记[name]=async(q,meta)=>write('日记.'+name,[q],meta)
 if(o.本机私密===true){for(const name of ['写入私密','记录私密评估'])日记[name]=async(q,meta)=>write('日记.'+name,[q],meta);日记.删除私密=async(q,meta)=>write('日记.删除私密',[q,{用途:'local-private-diary'}],meta);for(const name of ['读取本机私密','读取本机评估'])日记[name]=async()=>read('日记.'+name,[{用途:'local-private-diary'}])}
 const 旧格式=Object.freeze({读最早历史页:async(q={})=>read('旧格式.读最早历史页',[q]),读消息页:async q=>read('旧格式.读消息页',[q])})
 const 轮次执行={读取:async id=>read('轮次执行.读取',[id]),取暂存结果:async id=>read('轮次执行.取暂存结果',[id])}
 for(const name of ['预留','标记可能发送','标记未知','暂存结果','模拟完成'])轮次执行[name]=async(q,meta)=>write('轮次执行.'+name,[q],meta)
 const 备份=Object.freeze({虚构轮次快照:async scope=>read('备份.虚构轮次快照',[scope])})
 return Object.freeze({状态:创建异步状态接口(actor),会话,记忆:Object.freeze(记忆),日记:Object.freeze(日记),旧格式,轮次执行:Object.freeze(轮次执行),备份})
}
module.exports={创建异步仓储门面}
