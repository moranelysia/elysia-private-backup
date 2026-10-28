/** Synthetic-only diary schedule: task creation, not diary generation. */
'use strict'
const path=require('node:path'),{randomUUID}=require('node:crypto'),{创建异步仓储门面}=require('../storage/sqlite-async-facade.cjs'),{校验隔离后台调度}=require('./隔离一次性假发送.cjs'),{计算日记周期}=require('../脑/记忆日记.cjs')
function 创建隔离异步日记计划({actor,调度器,取现在=()=>new Date()}={}){
 校验隔离后台调度(调度器,actor);if(typeof 取现在!=='function')throw Error('ASYNC_DIARY_PLAN_INVALID');const f=创建异步仓储门面(actor);let busy=false,closed=false
 async function 安排({检查写入=()=>{}}={}){if(closed||busy||typeof 检查写入!=='function')throw Error('ASYNC_DIARY_PLAN_UNAVAILABLE');检查写入();busy=true;let backend
  try{const clock=取现在();if(!(clock instanceof Date)||!Number.isFinite(clock.getTime()))throw Error('ASYNC_DIARY_PLAN_CLOCK_INVALID');backend=await f.状态.打开后端('diary-index','main');const snapshot=await backend.读取分段快照(),index=snapshot.数据??{格式版本:1,最后调度日期:'',任务:[]};if(index.格式版本!==1||!Array.isArray(index.任务)||typeof index.最后调度日期!=='string')throw Error('ASYNC_DIARY_PLAN_INVALID');const plan=计算日记周期(index.最后调度日期,clock),ids=new Set(index.任务.map(x=>x.编号));if(ids.size!==index.任务.length||ids.has(undefined))throw Error('ASYNC_DIARY_PLAN_INVALID');let added=0
   for(const {类型,期间} of plan.列表){const id=类型+':'+期间.周期;if(ids.has(id))continue;if(index.任务.length>=1000)throw Error('ASYNC_DIARY_PLAN_LIMIT');ids.add(id);const stamp=clock.toISOString();index.任务.push({编号:id,类型,周期:期间.周期,开始:期间.开始.toISOString(),结束:期间.结束.toISOString(),文件:path.join(类型,String(期间.周期).slice(0,4),期间.周期+'.json'),状态:'待处理',尝试次数:0,创建于:stamp,更新于:stamp,下次尝试:'',错误:''});added++}
   const changed=added>0||index.最后调度日期!==plan.最后调度日期;index.最后调度日期=plan.最后调度日期;if(changed){if(closed)throw Error('ASYNC_DIARY_PLAN_UNAVAILABLE');检查写入();await backend.保存快照(index,{预期版本:snapshot.版本,操作编号:'diary-plan-'+randomUUID()})}return{好:true,新增:added,待处理:index.任务.filter(x=>['待处理','失败待重试'].includes(x.状态)).length}
  }finally{if(backend)await backend.关闭();busy=false}}
 return Object.freeze({安排,关闭(){closed=true}})
}
module.exports={创建隔离异步日记计划}
