import {randomBytes} from 'node:crypto';

export function validateEndpoint(value) {
  let url;try{url=new URL(value);}catch{throw new Error('MCP 地址无效');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.hash||url.search)throw new Error('MCP 地址须使用无凭据和查询参数的 HTTPS；本地测试可使用回环 HTTP');
  return url.href;
}
class Provider {
  constructor({store,id,origin,state}) {this.store=store;this.id=id;this.origin=origin;this.oauthState=state;this.authorizationUrl=null;}
  get redirectUrl(){return this.origin+'/api/mcp/callback';}
  get clientMetadata(){return {client_name:'Heartball Diary Local',redirect_uris:[this.redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'};}
  state(){return this.oauthState;}
  secrets(){return this.store.read(this.id,'oauth.json',{});}
  save(values){this.store.write(this.id,'oauth.json',{...this.secrets(),...values});}
  clientInformation(){return this.secrets().clientInformation;}
  saveClientInformation(value){this.save({clientInformation:value});}
  tokens(){return this.secrets().tokens;}
  saveTokens(value){this.save({tokens:value});}
  discoveryState(){return this.secrets().discovery;}
  saveDiscoveryState(value){
    const expected=new URL(value.authorizationServerUrl).href.replace(/\/$/,'');
    const advertised=value.authorizationServerMetadata?.issuer;
    if(advertised&&new URL(advertised).href.replace(/\/$/,'')!==expected)throw new Error('授权服务器标识不匹配');
    this.save({discovery:value});
  }
  redirectToAuthorization(url){this.authorizationUrl=url.toString();}
  saveCodeVerifier(value){this.save({codeVerifier:value});}
  codeVerifier(){const value=this.secrets().codeVerifier;if(!value)throw new Error('授权会话已过期，请重新连接');return value;}
  invalidateCredentials(scope){const current=this.secrets();if(scope==='all'){this.store.write(this.id,'oauth.json',{});return;}if(scope==='client')delete current.clientInformation;if(scope==='tokens')delete current.tokens;if(scope==='verifier')delete current.codeVerifier;if(scope==='discovery')delete current.discovery;this.store.write(this.id,'oauth.json',current);}
}
export class McpConnections {
  constructor(store,origin){this.store=store;this.origin=origin;this.sessions=new Map();this.pending=new Map();}
  async sdk(){const [{Client},{StreamableHTTPClientTransport}]=await Promise.all([import('@modelcontextprotocol/sdk/client/index.js'),import('@modelcontextprotocol/sdk/client/streamableHttp.js')]);return {Client,StreamableHTTPClientTransport};}
  async connect(id){
    await this.close(id);
    for(const [state,pending] of this.pending)if(pending.id===id||Date.now()-pending.created>600000)this.pending.delete(state);
    const endpoint=validateEndpoint(this.store.settings(id).mcp.endpoint);
    const {Client,StreamableHTTPClientTransport}=await this.sdk();
    const state=randomBytes(32).toString('hex');
    const provider=new Provider({store:this.store,id,origin:this.origin,state});
    const client=new Client({name:'heartball-diary',version:'0.1.0'});
    const transport=new StreamableHTTPClientTransport(new URL(endpoint),{authProvider:provider,fetch:(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})});
    try {
      await client.connect(transport,{timeout:30000});
      await this.assertTools(client);this.sessions.set(id,{client,transport});return {connected:true};
    }catch(error){
      if(provider.authorizationUrl){this.pending.set(state,{id,provider,transport,created:Date.now(),endpoint});await client.close().catch(()=>{});return {connected:false,authorizationUrl:provider.authorizationUrl};}
      await client.close().catch(()=>{});throw error;
    }
  }
  async assertTools(client){
    const names=new Set();let cursor;
    for(let i=0;i<100;i++){const page=await client.listTools(cursor?{cursor}:{},{timeout:30000});page.tools.forEach(t=>names.add(t.name));cursor=page.nextCursor;if(!cursor)break;}
    if(cursor||!names.has('recall_memory')||!names.has('recall_note'))throw new Error('该 MCP 未提供 recall_memory 和 recall_note，请检查心力球服务地址');
  }
  async callback(params){
    const state=params.get('state');const pending=this.pending.get(state);
    if(!pending||Date.now()-pending.created>600000)throw new Error('授权会话无效或过期，请重新连接');
    this.pending.delete(state);
    if(params.get('error')||!params.get('code'))throw new Error('授权未完成，请重新连接');
    if(this.store.settings(pending.id).mcp.endpoint!==pending.endpoint)throw new Error('MCP 地址已更改，请重新连接');
    const issuer=pending.provider.clientInformation()?.issuer;
    if(params.get('iss')&&(!issuer||new URL(params.get('iss')).href.replace(/\/$/,'')!==new URL(issuer).href.replace(/\/$/,'')))throw new Error('授权服务器标识不匹配');
    await pending.transport.finishAuth(params.get('code'));
    const result=await this.connect(pending.id);
    if(!result.connected)throw new Error('授权尚未生效，请重新连接');
    return pending.id;
  }
  async client(id){if(!this.sessions.has(id)){const result=await this.connect(id);if(!result.connected){const error=new Error('需要在设置中完成 MCP 授权');error.authorizationRequired=true;throw error;}}return this.sessions.get(id).client;}
  async close(id){const old=this.sessions.get(id);this.sessions.delete(id);if(old)await old.client.close().catch(()=>{});}
  async closeAll(){await Promise.all([...this.sessions.keys()].map(id=>this.close(id)));}
}
