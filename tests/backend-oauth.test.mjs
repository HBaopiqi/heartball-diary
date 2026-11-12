import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {McpConnections} from '../server/mcp.mjs';

test('real MCP SDK performs dynamic OAuth registration, state+PKCE exchange, then read-only tools',async t=>{
  const dir=fs.mkdtempSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'backend-temp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(dir);const id=store.index.activeProfileId;let origin;let challenge;let exchanged=false;let registrations=0;let toolCalls=0;
  const json=(res,status,body,headers={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body));};
  const fixture=http.createServer(async(req,res)=>{
    const url=new URL(req.url,origin);const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
    if(url.pathname==='/resource-metadata')return json(res,200,{resource:origin+'/mcp',authorization_servers:[origin+'/oauth'],scopes_supported:['mcp']});
    if(url.pathname==='/.well-known/oauth-authorization-server/oauth')return json(res,200,{issuer:origin+'/oauth',authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp']});
    if(url.pathname==='/register'){registrations++;return json(res,201,{...JSON.parse(body),client_id:'test-local-client'});}
    if(url.pathname==='/token'){
      const params=new URLSearchParams(body);assert.equal(params.get('code'),'local-code');assert.equal(params.get('client_id'),'test-local-client');
      assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),challenge);exchanged=true;
      return json(res,200,{access_token:'fixture-access',refresh_token:'fixture-refresh',token_type:'Bearer',expires_in:3600,scope:'mcp'});
    }
    if(url.pathname==='/mcp'){
      if(req.headers.authorization!=='Bearer fixture-access')return json(res,401,{error:'unauthorized'},{'www-authenticate':`Bearer resource_metadata="${origin}/resource-metadata"`});
      if(req.method==='GET'||req.method==='DELETE'){res.writeHead(405);return res.end();}
      const message=JSON.parse(body);if(!('id'in message)){res.writeHead(202);return res.end();}
      let result;
      if(message.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
      else if(message.method==='tools/list')result={tools:['recall_memory','recall_note'].map(name=>({name,inputSchema:{type:'object'}}))};
      else if(message.method==='tools/call'){toolCalls++;assert.equal(message.params.name,'recall_memory');result={content:[{type:'text',text:'fixture'}]};}
      else return json(res,200,{jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'not implemented'}});
      return json(res,200,{jsonrpc:'2.0',id:message.id,result});
    }
    return json(res,404,{error:'not found'});
  });
  await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+fixture.address().port;
  t.after(()=>{fixture.closeAllConnections();return new Promise(resolve=>fixture.close(resolve));});
  store.write(id,'settings.json',{mcp:{endpoint:origin+'/mcp'}});
  const connections=new McpConnections(store,'http://127.0.0.1:3210');t.after(()=>connections.closeAll());
  const result=await connections.connect(id);assert.equal(result.connected,false);const authorization=new URL(result.authorizationUrl);challenge=authorization.searchParams.get('code_challenge');
  assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');assert.equal(registrations,1);assert.ok(challenge);
  await assert.rejects(()=>connections.callback(new URLSearchParams({state:'wrong',code:'local-code'})),/授权/);assert.equal(exchanged,false);
  const profile=await connections.callback(new URLSearchParams({state:authorization.searchParams.get('state'),code:'local-code',iss:origin+'/oauth'}));assert.equal(profile,id);assert.equal(exchanged,true);
  const client=await connections.client(id);await client.callTool({name:'recall_memory',arguments:{}});assert.equal(toolCalls,1);
  const saved=store.read(id,'oauth.json',{});assert.equal(saved.tokens.issuer,origin+'/oauth');assert.equal(saved.clientInformation.issuer,origin+'/oauth');
});
