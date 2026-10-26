/** F3C：只读源锁下创建新的本机副本，复制/重读/源复核完成后才发布。 */
'use strict'
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const {盘点显式来源}=require('./source-inventory.cjs'),{相对路径}=require('./sqlite-backup.cjs')
const 哈希=b=>createHash('sha256').update(b).digest('hex'),拷=x=>JSON.parse(JSON.stringify(x))
function 失败(c){throw Error('SQLITE_FREEZE_'+c)}
function 正规目录(p){if(typeof p!=='string'||!path.isAbsolute(p)||/^[\\/]{2}/u.test(p)||path.resolve(p)===path.parse(p).root)失败('PATH_INVALID');for(let q=path.resolve(p);;q=path.dirname(q)){if(fs.lstatSync(q).isSymbolicLink())失败('LINK_FORBIDDEN');if(q===path.dirname(q))break}const r=fs.realpathSync(p);if(!fs.statSync(r).isDirectory())失败('PATH_INVALID');return r}
const 内含=(a,b)=>{const r=path.relative(a,b);return !path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep)}
function 准备冻结(profile,scope){
 const r=盘点显式来源(profile,scope);if(!r.来源登记完整)失败('SOURCE_UNMAPPED')
 const 文件=r.来源.filter(x=>!['excluded','separate-secret'].includes(x.去向)).map(x=>{
  if(x.目录)失败('FILE_INVALID');相对路径(x.来源)
  const roots=r.根.filter(q=>q.路径&&(x.来源===q.域||x.来源.startsWith(q.域+'/')));if(roots.length!==1)失败('ROOT_INVALID')
  const p=path.join(roots[0].路径,x.来源.slice(roots[0].域.length));return{...x,源路径:p}
 });if(文件.length>4000||文件.some(x=>x.字节数>64*1024*1024)||文件.reduce((s,x)=>s+x.字节数,0)>256*1024*1024)失败('LIMIT')
 return{清单:r,文件}
}
function 只读锁核验(files){
 if(process.platform!=='win32')失败('WINDOWS_LOCK_REQUIRED')
 // 仅申请/立即关闭写句柄，不写任何字节；全部被共享锁拒绝才允许复制。
 for(const x of files){let fd;try{fd=fs.openSync(x.源路径,'r+')}catch(e){if(['EACCES','EPERM','EBUSY'].includes(e.code))continue;throw e}finally{if(fd!==undefined)fs.closeSync(fd)}失败('SOURCE_NOT_LOCKED')}
}
function 核验冻结(目录){
 const root=正规目录(目录);if(fs.lstatSync(path.join(root,'migration')).isSymbolicLink()||fs.lstatSync(path.join(root,'migration/frozen-manifest.json')).isSymbolicLink())失败('LINK_FORBIDDEN')
 const m=JSON.parse(fs.readFileSync(path.join(root,'migration/frozen-manifest.json'),'utf8')),{指纹,...内容}=m
 if(m.版本!==1||m.用途!=='local-frozen-source'||哈希(JSON.stringify(内容))!==指纹||!Array.isArray(m.文件))失败('MANIFEST_INVALID')
 const seen=new Set();for(const f of m.文件){相对路径(f.路径);if(seen.has(f.路径.toLowerCase()))失败('MANIFEST_INVALID');seen.add(f.路径.toLowerCase());const p=path.join(root,f.路径)
  for(let q=p;q!==root;q=path.dirname(q)){if(!内含(root,q)||fs.lstatSync(q).isSymbolicLink())失败('LINK_FORBIDDEN')}
  const s=fs.lstatSync(p);if(!s.isFile()||s.nlink!==1||s.size!==f.字节数)失败('COPY_MISMATCH');const b=fs.readFileSync(p);if(哈希(b)!==f.sha256)失败('COPY_MISMATCH')
 }
 function walk(p,rel=''){for(const n of fs.readdirSync(p)){const q=path.join(p,n),r=rel?rel+'/'+n:n,s=fs.lstatSync(q);if(s.isSymbolicLink())失败('LINK_FORBIDDEN');if(s.isDirectory())walk(q,r);else if(r!=='migration/frozen-manifest.json'&&!seen.has(r.toLowerCase()))失败('UNLISTED_FILE')}}walk(root)
 return 拷(m)
}
function 创建冻结副本(profile,scope,输出父目录,预期指纹){
 const p=准备冻结(profile,scope);if(p.清单.清单指纹!==预期指纹)失败('SOURCE_CHANGED');只读锁核验(p.文件)
 const parent=正规目录(输出父目录);if(p.清单.根.some(r=>r.路径&&(内含(r.路径,parent)||内含(parent,r.路径))))失败('OUTPUT_OVERLAP')
 const root=fs.mkdtempSync(path.join(parent,'F3C-')),stage=path.join(root,'staging'),ready=path.join(root,'frozen');let 发布中=false
 try{fs.mkdirSync(stage,{mode:0o700});const 文件=[]
  for(const x of p.文件){const b=fs.readFileSync(x.源路径);if(b.length!==x.字节数)失败('SOURCE_CHANGED');let parentDir=stage;for(const part of x.来源.split('/').slice(0,-1)){const next=path.join(parentDir,part);try{fs.mkdirSync(next,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}if(fs.lstatSync(next).isSymbolicLink()||!fs.statSync(next).isDirectory())失败('LINK_FORBIDDEN');parentDir=next}
   const dest=path.join(stage,x.来源),fd=fs.openSync(dest,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   if(!fs.readFileSync(dest).equals(b))失败('COPY_MISMATCH');文件.push({路径:x.来源,去向:x.去向,类型:x.类型,字节数:b.length,sha256:哈希(b)})
  }
  const again=准备冻结(profile,scope);if(again.清单.清单指纹!==预期指纹)失败('SOURCE_CHANGED')
  for(let i=0;i<p.文件.length;i++)if(哈希(fs.readFileSync(p.文件[i].源路径))!==文件[i].sha256)失败('SOURCE_CHANGED')
  const 内容={版本:1,用途:'local-frozen-source',时间:new Date().toISOString(),源锁:'Windows FileShare.Read; all write-open probes rejected',源清单指纹:预期指纹,来源根:p.清单.根.filter(x=>x.路径&&x.域!=='local/configuration').map(({域,路径})=>({域,路径})),缺省:p.清单.缺省,缺省业务:p.清单.未存在的已登记业务,文件},manifest={...内容,指纹:哈希(JSON.stringify(内容))}
  fs.mkdirSync(path.join(stage,'migration'));fs.writeFileSync(path.join(stage,'migration/frozen-manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});核验冻结(stage)
  for(const x of 文件)fs.chmodSync(path.join(stage,x.路径),0o400)
  fs.chmodSync(path.join(stage,'migration/frozen-manifest.json'),0o400)
  发布中=true;fs.renameSync(stage,ready);核验冻结(ready);return{根:root,目录:ready,manifest}
 }catch(e){const x=Error(发布中&&fs.existsSync(ready)?'SQLITE_FREEZE_PUBLICATION_UNKNOWN':/^SQLITE_FREEZE_/u.test(e.message)?e.message:'SQLITE_FREEZE_COPY_FAILED');x.隔离目录=root;throw x}
}
module.exports={准备冻结,创建冻结副本,核验冻结}
