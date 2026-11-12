import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {setup,launch} from '../scripts/setup.mjs';
import {selectedPort,inspectPort} from '../scripts/doctor.mjs';

test('setup skips valid dependencies, installs missing ones once, and checks after installation',async()=>{
  let calls=0;
  const options={version:'22.0.0',root:'fixture path with spaces',log:()=>{},install:root=>{assert.equal(root,'fixture path with spaces');calls++;return {status:0};}};
  assert.deepEqual(await setup({...options,inspect:async()=>({ready:true})}),{ready:true,installed:false});assert.equal(calls,0);
  let reads=0;
  assert.deepEqual(await setup({...options,inspect:async()=>({ready:++reads>1})}),{ready:true,installed:true});assert.equal(calls,1);assert.equal(reads,2);
});
test('setup stops on unsupported Node, failed install, or inconsistent lock without declaring success',async()=>{
  let installs=0;const options={log:()=>{},install:()=>{installs++;return {status:1};},inspect:async()=>({ready:false})};
  await assert.rejects(setup({...options,version:'20.0.0'}),/Node.js 22/);assert.equal(installs,0);
  await assert.rejects(setup({...options,version:'22.0.0',inspect:async()=>({ready:false,lockMismatch:true,reason:'lock mismatch'})}),/lock mismatch/);assert.equal(installs,0);
  await assert.rejects(setup({...options,version:'22.0.0'}),/安装未完成/);assert.equal(installs,1);
});
test('doctor distinguishes a free port, another app and a responding local diary service',async()=>{
  let health=false;
  const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(health?{ok:true,mode:'local',version:'0.1.0'}:{other:true}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{assert.equal((await inspectPort(port)).state,'occupied');health=true;assert.equal((await inspectPort(port)).state,'service');}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
  assert.equal((await inspectPort(port)).state,'available');
  for(const value of ['0','abc','65536','-1'])assert.throws(()=>selectedPort(value),/PORT/);
});
test('launch reuses a responding service and leaves a new server running without installer timeout',async()=>{
  let launches=0;const run=(file,args,options)=>{launches++;assert.equal(options.timeout,0);assert.equal(options.env.PORT,'3211');assert.match(args[0],/server[\\/]index.mjs$/);return {status:0};};
  const options={port:3211,run,log:()=>{}};
  assert.deepEqual(await launch({...options,inspect:async()=>({state:'service'})}),{reused:true});assert.equal(launches,0);
  assert.deepEqual(await launch({...options,inspect:async()=>({state:'available'})}),{reused:false});assert.equal(launches,1);
  await assert.rejects(launch({...options,inspect:async()=>({state:'occupied',message:'occupied'})}),/occupied/);assert.equal(launches,1);
});
