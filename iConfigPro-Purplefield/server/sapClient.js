const http = require('http');
const https = require('https');

const SAP = {
  protocol: process.env.SAP_PROTOCOL || 'http', host: process.env.SAP_HOST || 'mckeccasf210.mckinsol.com',
  port: parseInt(process.env.SAP_PORT || '8014',10), client: process.env.SAP_CLIENT || '200',
  user: process.env.SAP_USER || '', password: process.env.SAP_PASSWORD || '',
  service: process.env.SAP_SOURCE_SERVICE || 'ZIM_BCSET_BRONZE_SRV'
};
const DDIC_FIELDS = {
  protocol: process.env.SAP_DDIC_FIELDS_PROTOCOL || SAP.protocol, host: process.env.SAP_DDIC_FIELDS_HOST || SAP.host,
  port: parseInt(process.env.SAP_DDIC_FIELDS_PORT || SAP.port,10), client: process.env.SAP_DDIC_FIELDS_CLIENT || SAP.client,
  user: process.env.SAP_DDIC_FIELDS_USER || SAP.user, password: process.env.SAP_DDIC_FIELDS_PASSWORD || SAP.password,
  service: process.env.SAP_DDIC_FIELDS_SERVICE || 'ZIM_DDIC_FIELDS_SRV'
};
const SPRO_IMG = {
  protocol: process.env.SAP_SPRO_IMG_PROTOCOL || SAP.protocol, host: process.env.SAP_SPRO_IMG_HOST || SAP.host,
  port: parseInt(process.env.SAP_SPRO_IMG_PORT || SAP.port,10), client: process.env.SAP_SPRO_IMG_CLIENT || SAP.client,
  user: process.env.SAP_SPRO_IMG_USER || SAP.user, password: process.env.SAP_SPRO_IMG_PASSWORD || SAP.password,
  service: process.env.SAP_SPRO_IMG_SERVICE || 'ZIM_SPRO_IMG_SRV', entitySet: process.env.SAP_SPRO_IMG_ENTITYSET || 'SPROHierarchySet'
};
const SOURCE_META = {
  protocol: process.env.SAP_SOURCE_METADATA_PROTOCOL || SAP.protocol, host: process.env.SAP_SOURCE_METADATA_HOST || SAP.host,
  port: parseInt(process.env.SAP_SOURCE_METADATA_PORT || SAP.port,10), client: process.env.SAP_SOURCE_METADATA_CLIENT || SAP.client,
  user: process.env.SAP_SOURCE_METADATA_USER || SAP.user, password: process.env.SAP_SOURCE_METADATA_PASSWORD || SAP.password,
  service: process.env.SAP_SOURCE_METADATA_SERVICE || 'ZIM_BCSET_ODATA_SRV'
};
const DEPLOY = {
  protocol: process.env.SAP_DEPLOY_PROTOCOL || 'http', host: process.env.SAP_DEPLOY_HOST || '20.20.45.22',
  port: parseInt(process.env.SAP_DEPLOY_PORT || '8000',10), client: process.env.SAP_DEPLOY_CLIENT || SAP.client || '',
  user: process.env.SAP_DEPLOY_USER || '', password: process.env.SAP_DEPLOY_PASSWORD || '',
  service: process.env.SAP_DEPLOY_SERVICE || 'ZIM_BCSET_DEPLOY_SRV', entitySet: process.env.SAP_DEPLOY_ENTITYSET || 'DeployRequestSet'
};
const mode = String(process.env.DATA_MODE || 'mock').trim().toLowerCase();
const targetMode = String(process.env.TARGET_MODE || mode).trim().toLowerCase();
const mock = require('./mockClient');

function isConfigured(){ return !!(SAP.host && SAP.user && SAP.password); }
function isDeployConfigured(){ return targetMode === 'mock' || !!(DEPLOY.host && DEPLOY.user && DEPLOY.password); }
function withClient(pathAndQuery, client){
  if(!client || /[?&]sap-client=/.test(pathAndQuery)) return pathAndQuery;
  return pathAndQuery + (pathAndQuery.includes('?')?'&':'?') + 'sap-client=' + encodeURIComponent(client);
}
function request(target,{method='GET',pathAndQuery,headers={},body=null,timeoutMs=30000}={}){
  return new Promise((resolve,reject)=>{
    const transport=target.protocol==='https'?https:http;
    const auth=Buffer.from(`${target.user}:${target.password}`).toString('base64');
    const bodyBuf=body?Buffer.from(body,'utf8'):null;
    const req=transport.request({protocol:target.protocol+':',hostname:target.host,port:target.port,path:withClient(pathAndQuery,target.client),method,
      headers:Object.assign({Authorization:`Basic ${auth}`,Accept:'application/json'},bodyBuf?{'Content-Type':'application/json','Content-Length':bodyBuf.length}:{},headers),rejectUnauthorized:false,timeout:timeoutMs},res=>{
      const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('timeout',()=>req.destroy(new Error('SAP request timed out'))); req.on('error',reject); if(bodyBuf) req.end(bodyBuf); else req.end();
  });
}
function get(path){ if(!isConfigured()) return Promise.reject(new Error('SAP source is not configured')); return request(SAP,{pathAndQuery:path}); }
function getDdicFields(path){
  if(!DDIC_FIELDS.host || !DDIC_FIELDS.user || !DDIC_FIELDS.password) return Promise.reject(new Error('SAP DDIC fields connection is not configured'));
  return request(DDIC_FIELDS,{pathAndQuery:path});
}
function getSproImg(path){
  if(!SPRO_IMG.host || !SPRO_IMG.user || !SPRO_IMG.password) return Promise.reject(new Error('SAP SPRO IMG connection is not configured'));
  return request(SPRO_IMG,{pathAndQuery:path,timeoutMs:parseInt(process.env.SAP_SPRO_IMG_TIMEOUT_MS || '120000',10)});
}

function getSourceMetadata(path){
  if(!SOURCE_META.host || !SOURCE_META.user || !SOURCE_META.password) return Promise.reject(new Error('SAP source metadata connection is not configured'));
  return request(SOURCE_META,{pathAndQuery:path});
}
function pickProp(row, candidates){
  if(!row) return '';
  const keys=Object.keys(row);
  const exact=new Map(keys.map(k=>[k.toLowerCase(),k]));
  for(const c of candidates){ const hit=exact.get(String(c).toLowerCase()); if(hit) return hit; }
  for(const c of candidates){ const u=String(c).toUpperCase(); const hit=keys.find(k=>k.toUpperCase().includes(u)); if(hit) return hit; }
  return '';
}

function normalizeSapText(value){
  return String(value??'').replace(/\u00a0/g,' ').trim();
}

// BCSetValueSet is field-level data. The same SAP row can appear more than
// once when the provider is read through different paging/filter paths.
// Bronze must expose one logical value row only.
function dedupeValueRows(rows){
  const seen=new Set();
  const out=[];
  let duplicateCount=0;
  for(const row of rows||[]){
    const bc=normalizeSapText(row?.[pickProp(row,['BCSetID','BcsetId','BCSETID'])]);
    const table=normalizeSapText(row?.[pickProp(row,['TableName','Tablename','TABLENAME'])]).toUpperCase();
    const rec=normalizeSapText(row?.[pickProp(row,['RecNumber','Recnumber','RECNUMBER'])]);
    const field=normalizeSapText(row?.[pickProp(row,['FieldName','Fieldname','FIELDNAME'])]).toUpperCase();
    const key=`${bc.toUpperCase()}#${table}#${rec}#${field}`;
    if(seen.has(key)){duplicateCount++;continue;}
    seen.add(key);
    out.push(row);
  }
  return {rows:out,duplicateCount};
}

function dedupeByKey(rows,keyFn){
  const seen=new Set();
  const out=[];
  for(const row of rows||[]){
    const key=keyFn(row);
    if(seen.has(key))continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
function unwrapRows(json){
  if(json?.d?.results && Array.isArray(json.d.results)) return {rows:json.d.results,next:json.d.__next||null,version:'v2'};
  if(json?.value && Array.isArray(json.value)) return {rows:json.value,next:json['@odata.nextLink']||json['odata.nextLink']||null,version:'v4'};
  if(Array.isArray(json)) return {rows:json,next:null,version:'plain'};
  return {rows:[],next:null,version:'unknown'};
}
function relativeNext(next){
  if(!next) return null;
  try{ const u=new URL(next); return u.pathname+u.search; }catch{ return String(next); }
}
async function fetchAllRows(){
  const rows=[];
  const page=1000;
  let skip=0;
  let previousSig='';
  const selected=String(process.env.SAP_BCSET_ID||'').trim();

  // This custom SAP provider commonly implements the BC Set restriction in
  // GET_ENTITYSET even though the generated metadata says sap:filterable=false.
  // Use the exact OData property name exposed by the new Bronze service: BcsetId.
  // This is important because an unfiltered read can legitimately return an
  // empty result from this implementation.
  const baseParams = selected
    ? `&$filter=BCSetID%20eq%20%27${encodeURIComponent(selected).replace(/'/g,"%27%27")}%27`
    : '';

  for(let call=1; call<=200; call++){
    const path=`/sap/opu/odata/sap/${SAP.service}/BCSetValueSet?$format=json&$top=${page}&$skip=${skip}${baseParams}`;
    const r=await get(path);
    if(r.status!==200) throw new Error(`BCSetValueSet returned HTTP ${r.status}: ${r.body.slice(0,800)}`);
    let j; try{j=JSON.parse(r.body);}catch(e){throw new Error('BCSetValueSet did not return JSON: '+r.body.slice(0,300));}
    const u=unwrapRows(j);
    if(!u.rows.length) break;
    const sig=u.rows.length+'|'+JSON.stringify(u.rows[0]);
    if(sig===previousSig) break;
    previousSig=sig;
    rows.push(...u.rows);
    if(u.next){
      let pNext=relativeNext(u.next);
      if(pNext){
        let np=pNext;
        for(let n=call+1;n<=200;n++){
          const rr=await get(np);
          if(rr.status!==200) throw new Error(`BCSetValueSet next page returned HTTP ${rr.status}: ${rr.body.slice(0,500)}`);
          let jj; try{jj=JSON.parse(rr.body);}catch(e){throw new Error('BCSetValueSet next page did not return JSON: '+rr.body.slice(0,300));}
          const uu=unwrapRows(jj);
          if(!uu.rows.length) return rows;
          const ss=uu.rows.length+'|'+JSON.stringify(uu.rows[0]);
          if(ss===previousSig) return rows;
          previousSig=ss; rows.push(...uu.rows);
          if(!uu.next) return rows;
          np=relativeNext(uu.next); if(!np) return rows;
        }
        return rows;
      }
    }
    if(u.rows.length<page) break;
    skip=rows.length;
  }
  return rows;
}

async function fetchBcSetRowsFromService(id,force=false){
  const wanted=String(id||'').trim();
  if(!wanted) return [];

  // First use the exact source property from the user's $metadata: BCSetID.
  const encoded=wanted.replace(/'/g,"''");
  const filteredPath=`/sap/opu/odata/sap/${SAP.service}/BCSetValueSet?$format=json&$filter=BCSetID%20eq%20%27${encodeURIComponent(encoded)}%27&$top=1000&$skip=0`;
  const first=await get(filteredPath);
  if(first.status!==200) throw new Error(`BCSetValueSet filtered read returned HTTP ${first.status}: ${first.body.slice(0,800)}`);
  let fj; try{fj=JSON.parse(first.body);}catch(e){throw new Error('Filtered BCSetValueSet did not return JSON: '+first.body.slice(0,300));}
  const fu=unwrapRows(fj);
  if(fu.rows.length) {
    // If the provider supplies a next link, consume it. Otherwise continue
    // with $skip pages when the page is full.
    const rows=[...fu.rows];
    let next=relativeNext(fu.next);
    let skip=rows.length;
    for(let i=0;i<200;i++){
      if(next){
        const rr=await get(next); if(rr.status!==200) throw new Error(`BCSetValueSet next page returned HTTP ${rr.status}: ${rr.body.slice(0,500)}`);
        let jj=JSON.parse(rr.body); const uu=unwrapRows(jj); if(!uu.rows.length) break;
        rows.push(...uu.rows); next=relativeNext(uu.next); if(!next && uu.rows.length<1000) break; continue;
      }
      if(rows.length<1000) break;
      const rr=await get(`/sap/opu/odata/sap/${SAP.service}/BCSetValueSet?$format=json&$filter=BCSetID%20eq%20%27${encodeURIComponent(encoded)}%27&$top=1000&$skip=${rows.length}`);
      if(rr.status!==200) throw new Error(`BCSetValueSet page returned HTTP ${rr.status}: ${rr.body.slice(0,500)}`);
      const uu=unwrapRows(JSON.parse(rr.body)); if(!uu.rows.length) break;
      const sig=JSON.stringify(uu.rows[0]);
      if(sig===JSON.stringify(rows[0])) break;
      rows.push(...uu.rows);
    }
    return dedupeValueRows(rows).rows;
  }

  // Some versions of the custom provider advertise filterable=false and may
  // return zero for a filtered request. In that case read the entity set and
  // scope by BCSetID in Node. This is a fallback, not the primary path.
  const all=await fetchAllRows();
  if(!all.length) return [];
  const bcProp=pickProp(all[0],['BCSetID']);
  if(!bcProp) throw new Error(`BCSetValueSet is missing BCSetID. First row properties: ${Object.keys(all[0]).join(', ')}`);
  return dedupeValueRows(all.filter(r=>String(r?.[bcProp]??'').trim().toUpperCase()===wanted.toUpperCase())).rows;
}

let cache=null;
async function loadAllRows(force=false){
  if(mode==='mock') return mock.loadRows('DEMO_E2E');
  if(!cache||force) cache={rows:await fetchAllRows(),fetchedAt:new Date().toISOString()};
  return cache.rows;
}

async function fetchDdicFields(tableName){
  const table=normalizeSapText(tableName).toUpperCase();
  if(!table) throw new Error('Table name is required');
  const encoded=encodeURIComponent(table).replace(/'/g,"''");
  const base=`/sap/opu/odata/sap/${DDIC_FIELDS.service}/TableFieldSet?$format=json&$filter=TableName%20eq%20%27${encoded}%27&$top=1000&$skip=0`;
  const rows=[];
  let nextPath=base;
  for(let page=0;page<200 && nextPath;page++){
    const r=await getDdicFields(nextPath);
    if(r.status!==200) throw new Error(`DDIC field service returned HTTP ${r.status}: ${r.body.slice(0,800)}`);
    let j; try{j=JSON.parse(r.body);}catch(e){throw new Error('DDIC field service did not return JSON: '+r.body.slice(0,300));}
    const u=unwrapRows(j);
    rows.push(...u.rows);
    if(u.next){
      nextPath=relativeNext(u.next);
    }else if(u.rows.length>=1000){
      nextPath=`/sap/opu/odata/sap/${DDIC_FIELDS.service}/TableFieldSet?$format=json&$filter=TableName%20eq%20%27${encoded}%27&$top=1000&$skip=${rows.length}`;
    }else{
      nextPath=null;
    }
  }
  const out=rows.map(row=>({
    fieldName:normalizeSapText(row?.[pickProp(row,['FieldName','FIELDNAME'])]).toUpperCase(),
    description:normalizeSapText(row?.[pickProp(row,['FieldText','FIELDTEXT'])]),
    dataType:normalizeSapText(row?.[pickProp(row,['DataType','DATATYPE'])]).toUpperCase(),
    length:Number(row?.[pickProp(row,['Length','LENG'])]||0),
    decimals:Number(row?.[pickProp(row,['Decimals','DECIMALS'])]||0),
    key:String(row?.[pickProp(row,['KeyFlag','KEYFLAG'])]||'').trim().toUpperCase()==='X',
    position:Number(row?.[pickProp(row,['Position','POSITION'])]||0)
  })).filter(x=>x.fieldName);
  const seen=new Set();
  return out.filter(x=>{if(seen.has(x.fieldName))return false;seen.add(x.fieldName);return true;}).sort((a,b)=>a.position-b.position||a.fieldName.localeCompare(b.fieldName));
}

async function fetchBcSetValues(id,force){
  if(mode==='mock') return mock.loadRows(id);
  // The new Bronze source exposes BcsetId. OData property names are
  // case-sensitive at the Gateway URI parser, so the filter must use the
  // exact metadata spelling. Response mapping remains case-insensitive.
  // Read that exact BC Set first; fall back to the complete paged set if the
  // provider does not implement $filter.
  return fetchBcSetRowsFromService(id,force);
}
async function listBcSets(force){
  if(mode==='mock') return mock.listBcSets();
  const rows=await loadAllRows(force);
  const m=new Map();
  rows.forEach(r=>{
    const prop=pickProp(r,['BcSetId','BcsetId','BCSetID','BCSETID','BCSET','BCSet']);
    const id=prop?String(r[prop]??'').trim():'';
    if(id&&!m.has(id)){
      const np=pickProp(r,['BcsetName','BCSetName','BCSETNAME','Name']);
      m.set(id,np?String(r[np]??'').trim():'');
    }
  });
  return [...m].map(([id,name])=>({id,name})).sort((a,b)=>a.id.localeCompare(b.id));
}
async function fetchSourceEntityRows(entitySet, bcsetId, filterProperty='BcsetId', target=SOURCE_META){
  const wanted=String(bcsetId||'').trim();
  if(!wanted) return [];

  const encoded=wanted.replace(/'/g,"''");
  const filteredPath=`/sap/opu/odata/sap/${target.service}/${entitySet}?$format=json&$filter=${encodeURIComponent(filterProperty)}%20eq%20%27${encodeURIComponent(encoded)}%27&$top=1000&$skip=0`;

  // Primary path: use the server-side BC Set filter.
  let filteredStatus=0;
  try{
    const first=await getSourceMetadata(filteredPath);
    filteredStatus=first.status;

    if(first.status>=200 && first.status<300){
      let fj;
      try{fj=JSON.parse(first.body)}
      catch(e){throw new Error(`${entitySet} filtered response was not valid JSON: ${first.body.slice(0,300)}`)}
      const fu=unwrapRows(fj);
      const rows=[...fu.rows];
      let next=relativeNext(fu.next);

      for(let i=0;i<200;i++){
        if(next){
          const rr=await getSourceMetadata(next);
          if(rr.status!==200) throw new Error(`${entitySet} next page returned HTTP ${rr.status}: ${rr.body.slice(0,600)}`);
          let jj; try{jj=JSON.parse(rr.body)}catch(e){throw new Error(`${entitySet} next page was not valid JSON: ${rr.body.slice(0,300)}`)}
          const uu=unwrapRows(jj);
          if(!uu.rows.length) break;
          rows.push(...uu.rows);
          next=relativeNext(uu.next);
          if(!next && uu.rows.length<1000) break;
          continue;
        }
        if(rows.length<1000) break;
        const rr=await getSourceMetadata(`/sap/opu/odata/sap/${target.service}/${entitySet}?$format=json&$filter=${encodeURIComponent(filterProperty)}%20eq%20%27${encodeURIComponent(encoded)}%27&$top=1000&$skip=${rows.length}`);
        if(rr.status!==200) break;
        const uu=unwrapRows(JSON.parse(rr.body));
        if(!uu.rows.length) break;
        rows.push(...uu.rows);
      }
      // A successful HTTP response with zero rows is NOT proof that the
      // filtered provider found no records. Custom SEGW providers can ignore
      // or mishandle $filter and still return HTTP 200 with an empty feed.
      // Only accept the filtered result when it actually contains rows.
      if(rows.length) return rows;
      console.warn(`[source] ${entitySet} filtered read returned HTTP 200 with 0 rows; using unfiltered compatibility read.`);
    }
  }catch(e){
    // Fall through to the unfiltered compatibility path below. The caller
    // receives a real error only if both paths fail.
    console.warn(`[source] ${entitySet} filtered read failed: ${e.message}`);
  }

  // Compatibility path: some custom Gateway entity-set implementations
  // advertise/behave as non-filterable and return HTTP 400 for $filter.
  // Do NOT silently convert that into an empty metadata set. Read the entity
  // set without $filter, page through it, and scope by BCSetId in Node.
  const rows=[];
  let next=`/sap/opu/odata/sap/${target.service}/${entitySet}?$format=json&$top=1000&$skip=0`;

  for(let i=0;i<200 && next;i++){
    const r=await getSourceMetadata(next);
    if(r.status!==200){
      throw new Error(`${entitySet} filtered read returned HTTP ${filteredStatus||'n/a'} and unfiltered fallback returned HTTP ${r.status}: ${r.body.slice(0,700)}`);
    }
    let j;
    try{j=JSON.parse(r.body)}
    catch(e){throw new Error(`${entitySet} unfiltered response was not valid JSON: ${r.body.slice(0,300)}`)}
    const u=unwrapRows(j);
    rows.push(...u.rows);
    if(u.next){
      next=relativeNext(u.next);
      continue;
    }
    if(u.rows.length<1000) break;
    next=`/sap/opu/odata/sap/${target.service}/${entitySet}?$format=json&$top=1000&$skip=${rows.length}`;
  }

  if(!rows.length) return [];

  const prop=pickProp(rows[0],[filterProperty,'BcSetId','BcsetId','BCSetID','BCSETID']);
  if(!prop){
    throw new Error(`${entitySet} fallback response has no BC Set property (${filterProperty}). Available properties: ${Object.keys(rows[0]).join(', ')}`);
  }

  return rows.filter(r=>String(r?.[prop]??'').trim().toUpperCase()===wanted.toUpperCase());
}

async function fetchSourceEntityRowsFromCandidates(candidates,bcsetId,filterProperty='BcsetId',target=SOURCE_META){
  const names=[...new Set((candidates||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  const errors=[];
  for(const entitySet of names){
    try{
      const rows=await fetchSourceEntityRows(entitySet,bcsetId,filterProperty,target);
      return {entitySet,rows};
    }catch(e){
      errors.push(`${entitySet}: ${e.message}`);
      // A 404 means that entity set is not published in this source OData
      // service. Try the compatibility entity set used by the earlier
      // working source service. Other errors are still allowed to fall
      // through so that a later compatibility candidate can be attempted.
      console.warn(`[source] metadata entity set ${entitySet} unavailable: ${e.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

async function fetchSourceDeployMetadata(bcsetId, tableNames=[]){
  if(mode==='mock') return {e071:[],e071k:[],recattr:[],available:false};
  const wanted=new Set((tableNames||[]).map(x=>String(x).trim().toUpperCase()).filter(Boolean));

  const configuredE071=process.env.SAP_SOURCE_E071_ENTITYSET;
  const configuredRecattr=process.env.SAP_SOURCE_RECATTR_ENTITYSET;
  const e071Candidates=[configuredE071,'BCSetE071RowSet','BCSetE071Set'].filter(Boolean);
  const recattrCandidates=[configuredRecattr,'BCSetRecAttrRowSet','BCSetRecAttrSet'].filter(Boolean);
  const e071Filter=process.env.SAP_SOURCE_E071_FILTER_PROPERTY||'BcsetId';
  const recattrFilter=process.env.SAP_SOURCE_RECATTR_FILTER_PROPERTY||'BcsetId';

  let e071Result;
  let e071Mode='flattened';
  try{
    e071Result=await fetchSourceEntityRowsFromCandidates(e071Candidates,bcsetId,e071Filter,SOURCE_META);
  }catch(e){
    throw new Error(`Source E071/E071K metadata could not be read for ${bcsetId}: ${e.message}`);
  }

  // Some installed versions of the source service expose the older pair of
  // entity sets instead of the newer flattened BCSetE071RowSet. Preserve
  // compatibility with that already-working service: BCSetE071Set contains
  // E071 headers and BCSetE071KSet contains their E071K children.
  let e071Rows=e071Result.rows;
  let legacyE071KRows=[];
  if(e071Result.entitySet==='BCSetE071Set'){
    e071Mode='legacy-pair';
    const legacyK=await fetchSourceEntityRowsFromCandidates(
      [process.env.SAP_SOURCE_E071K_ENTITYSET,'BCSetE071KSet'],bcsetId,process.env.SAP_SOURCE_E071K_FILTER_PROPERTY||e071Filter,SOURCE_META
    );
    legacyE071KRows=legacyK.rows;
  }

  let recattrResult;
  try{
    recattrResult=await fetchSourceEntityRowsFromCandidates(recattrCandidates,bcsetId,recattrFilter,SOURCE_META);
  }catch(e){
    throw new Error(`Source SCPRRECA metadata could not be read for ${bcsetId}: ${e.message}`);
  }
  const recattrRaw=recattrResult.rows;

  const e071All=[]; const e071kAll=[];
  for(const r of e071Rows){
    const row={Seq:String(r.Seq||r.SEQ||'').trim(),Trkorr:String(r.Trkorr||r.TRKORR||''),Pgmid:String(r.Pgmid||r.PGMID||''),Object:String(r.Object||r.OBJECT||''),ObjName:String(r.ObjName||r.OBJNAME||''),ObjFunc:String(r.ObjFunc||r.OBJFUNC||''),TabKey:String(r.TabKey||r.TABKEY||''),Activity:String(r.Activity||r.ACTIVITY||''),MasterType:String(r.MasterType||r.MASTERTYPE||''),MasterName:String(r.MasterName||r.MASTERNAME||''),ViewName:String(r.ViewName||r.VIEWNAME||''),SourceE071Seq:String(r.SourceE071Seq||r.SOURCEE071SEQ||'').trim()};
    if(normalizeSapText(row.TabKey)) e071kAll.push(row); else e071All.push(row);
  }
  for(const r of legacyE071KRows){
    e071kAll.push({Seq:String(r.Seq||r.SEQ||'').trim(),Trkorr:String(r.Trkorr||r.TRKORR||''),Pgmid:String(r.Pgmid||r.PGMID||''),Object:String(r.Object||r.OBJECT||''),ObjName:String(r.ObjName||r.OBJNAME||''),ObjFunc:String(r.ObjFunc||r.OBJFUNC||''),TabKey:String(r.TabKey||r.TABKEY||''),Activity:String(r.Activity||r.ACTIVITY||''),MasterType:String(r.MasterType||r.MASTERTYPE||''),MasterName:String(r.MasterName||r.MASTERNAME||''),ViewName:String(r.ViewName||r.VIEWNAME||''),SourceE071Seq:String(r.SourceE071Seq||r.SOURCEE071SEQ||'').trim()});
  }
  const e071Unique=dedupeByKey(e071All,r=>`${r.Seq}#${r.Pgmid}#${r.Object}#${r.ObjName}#${r.ObjFunc}#${r.Activity}`);
  const e071kUnique=dedupeByKey(e071kAll,r=>`${r.Seq}#${r.Pgmid}#${r.Object}#${r.ObjName}#${r.ObjFunc}#${r.TabKey}#${r.MasterType}#${r.MasterName}#${r.ViewName}`);
  function findParent(k){
    let h=e071Unique.find(x=>String(x.Pgmid).trim()===String(k.Pgmid).trim()&&String(x.Object).trim()===String(k.MasterType).trim()&&String(x.ObjName).trim()===String(k.MasterName).trim());
    if(!h&&!k.MasterType&&!k.MasterName) h=e071Unique.find(x=>String(x.Pgmid).trim()===String(k.Pgmid).trim()&&String(x.Object).trim()===String(k.Object).trim()&&String(x.ObjName).trim()===String(k.ObjName).trim());
    return h||null;
  }
  // The source BCSet service may identify an E071/E071K object by its
  // maintenance view (for example V_T001) while the application/process
  // directory is intentionally keyed by the physical table (T001). Do not
  // change the original SAP object names -- they are needed later when the
  // target replays the transport metadata. Instead, attach an internal
  // physical-table mapping used only for selection/provenance.
  function physicalTableForSourceRow(r){
    const names=[r?.ObjName,r?.MasterName,r?.ViewName].map(x=>String(x??'').trim().toUpperCase()).filter(Boolean);
    if(!wanted.size)return names[0]||'';
    for(const n of names){
      if(wanted.has(n))return n;
      // Common SAP maintenance-view naming patterns. Keep this deliberately
      // conservative so unrelated objects are not remapped.
      const stripped=n.replace(/^(?:VC_|V_|W_)/,'').replace(/_(?:ASSIGN|GD)$/,'');
      if(wanted.has(stripped))return stripped;
    }
    return '';
  }
  const relevantE071K=e071kUnique
    .map(k=>({...k,SourcePhysicalTable:physicalTableForSourceRow(k)}))
    .filter(k=>!wanted.size||Boolean(k.SourcePhysicalTable));
  const relevantKWithParent=relevantE071K.map(k=>{const h=findParent(k);return {...k,SourceE071Seq:h?String(h.Seq||''):''};});
  const parentSeqs=new Set(relevantKWithParent.map(k=>k.SourceE071Seq).filter(Boolean));
  const relevantE071=e071Unique.filter(h=>!wanted.size||parentSeqs.has(String(h.Seq||''))||wanted.has(String(h.ObjName).trim().toUpperCase())||wanted.has(String(h.MasterName).trim().toUpperCase())||wanted.has(String(h.ViewName).trim().toUpperCase()));
  const recattr=recattrRaw.map(r=>{
    const tab=normalizeSapText(r.TabName||r.Tabname||r.TABNAME||'');
    let physical=tab.toUpperCase();
    if(wanted.size&&!wanted.has(physical)){
      const stripped=physical.replace(/^(?:VC_|V_|W_)/,'').replace(/_(?:ASSIGN|GD)$/,'');
      if(wanted.has(stripped))physical=stripped;
      else return null;
    }
    return {Tablename:physical||tab,SourceTabName:tab,SourcePhysicalTable:physical||tab.toUpperCase(),Recnumber:normalizeSapText(r.RecNumber||r.Recnumber||r.RECNUMBER||''),ObjectName:String(r.ObjectName||r.OBJECTNAME||''),ObjectType:String(r.ObjectType||r.OBJECTTYPE||''),DocumentationObject:String(r.DocumentationObject||r.DOCUMENTATIONOBJECT||r.Activity||r.ACTIVITY||''),Uncomplete:String(r.Uncomplete||r.UNCOMPLETE||'')};
  }).filter(Boolean);
  const recattrUnique=dedupeByKey(recattr,r=>`${r.Tablename.toUpperCase()}#${r.Recnumber}`);
  const flattened=[];
  for(const h of relevantE071){
    flattened.push({Pgmid:h.Pgmid,Object:h.Object,ObjName:h.ObjName,ObjFunc:h.ObjFunc,TabKey:'',Activity:h.Activity,MasterType:'',MasterName:'',ViewName:''});
    const headerSeq=String(h.Seq||'').trim();
    relevantKWithParent.filter(k=>String(k.SourceE071Seq||'').trim()===headerSeq).forEach(k=>flattened.push({Pgmid:k.Pgmid,Object:k.Object,ObjName:k.ObjName,ObjFunc:k.ObjFunc,TabKey:k.TabKey,Activity:k.Activity||h.Activity||'',MasterType:k.MasterType,MasterName:k.MasterName,ViewName:k.ViewName}));
  }
  return {e071:relevantE071,e071k:relevantKWithParent,sourceE071:flattened,recattr:recattrUnique,available:Boolean(flattened.length&&relevantE071.length&&relevantKWithParent.length),diagnostics:{requestedTables:[...wanted],e071Service:SOURCE_META.service,e071EntitySet:e071Result.entitySet,e071Mode,recattrService:SOURCE_META.service,recattrEntitySet:recattrResult.entitySet,rawE071Rows:e071Rows.filter(r=>!normalizeSapText(r.TabKey||r.TABKEY)).length,rawE071KRows:e071Rows.filter(r=>normalizeSapText(r.TabKey||r.TABKEY)).length+legacyE071KRows.length,relevantE071Rows:relevantE071.length,relevantE071KRows:relevantKWithParent.length,recattrRows:recattrUnique.length,recattrPhysicalTables:[...new Set(recattrUnique.map(x=>x.SourcePhysicalTable||x.Tablename).filter(Boolean))],recattrWithObjectMetadata:recattrUnique.filter(x=>x.ObjectName&&x.ObjectType).length,recattrWithActivity:recattrUnique.filter(x=>x.DocumentationObject).length,flattenedRows:flattened.length,headersWithoutParent:e071Unique.filter(h=>!relevantKWithParent.some(k=>String(k.SourceE071Seq||'')===String(h.Seq||''))).length}};
}

async function postDeploy(payload){
  if(targetMode==='mock') return mock.deploy(payload);
  if(!isDeployConfigured()) throw new Error('Target deploy connection is not configured');
  const root=`/sap/opu/odata/sap/${DEPLOY.service}/`;
  const tokenRes=await request(DEPLOY,{pathAndQuery:root,headers:{'X-CSRF-Token':'Fetch'}});
  const token=tokenRes.headers['x-csrf-token']; if(!token) throw new Error(`Could not fetch CSRF token (HTTP ${tokenRes.status})`);
  const cookies=Array.isArray(tokenRes.headers['set-cookie'])?tokenRes.headers['set-cookie'].map(c=>c.split(';')[0]).join('; '):'';
  const res=await request(DEPLOY,{method:'POST',pathAndQuery:`/sap/opu/odata/sap/${DEPLOY.service}/${DEPLOY.entitySet}`,headers:Object.assign({'X-CSRF-Token':token},cookies?{Cookie:cookies}:{}),body:JSON.stringify(payload)});
  let parsed; try{parsed=JSON.parse(res.body)}catch{}
  if(res.status<200||res.status>=300){let msg=parsed?.error?.message?.value||res.body.slice(0,1200)||`HTTP ${res.status}`;if(/SCPR_EXT_BCSET_WRITE/i.test(msg)&&/ITAB_LINE_NOT_FOUND/i.test(msg)){msg += ' | SAP diagnostic: check ST22 for SCPR_PRSET_CT_KEY_CONFLICTS2; this exception pattern is documented in SAP KBA 3589578.';}throw new Error(`Target rejected deploy (HTTP ${res.status}): ${msg}`);}
  return parsed?.d||parsed||{};
}
async function fetchSproHierarchy(moduleName, language='E') {
  const moduleText=normalizeSapText(moduleName);
  const lang=normalizeSapText(language)||'E';
  if(!moduleText) return [];

  const entity=SPRO_IMG.entitySet;
  const service=SPRO_IMG.service;
  const root=`/sap/opu/odata/sap/${service}/`;

  /*
   * SPROHierarchySet does not expose a MODULE property.
   * The OData contract uses HIERARCHYKEY as the input key/filter value.
   * The DPC resolves this module text through TTREET-TEXT_CAP and then
   * calls STREE_HIERARCHY_READ.
   *
   * IMPORTANT: encode the COMPLETE $filter expression. Encoding only the
   * module value leaves spaces in expressions such as "... and ..." and
   * Node's HTTP client rejects the request with:
   *   Request path contains unescaped characters
   */
  const literal=moduleText.replace(/'/g,"''");
  const filter=`HierarchyKey eq '${literal}'`;
  const path=`${root}${entity}?$format=json&$filter=${encodeURIComponent(filter)}&$top=5000`;

  const r=await getSproImg(path);
  if(r.status!==200){
    throw new Error(`SPROHierarchySet returned HTTP ${r.status}: ${r.body.slice(0,1200)}`);
  }

  let j;
  try{j=JSON.parse(r.body);}catch(e){
    throw new Error('SPROHierarchySet did not return JSON: '+r.body.slice(0,500));
  }

  const u=unwrapRows(j);
  if(!u.rows.length) return [];

  return u.rows;
}

module.exports={SAP,SOURCE_META,DDIC_FIELDS,DEPLOY,SPRO_IMG,mode,targetMode,isConfigured,isDeployConfigured,get,fetchDdicFields,fetchBcSetValues,listBcSets,loadAllRows,fetchSourceDeployMetadata,postDeploy,fetchSproHierarchy,dedupeValueRows,dedupeByKey,normalizeSapText};
