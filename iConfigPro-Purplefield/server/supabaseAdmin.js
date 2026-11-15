const { codeFor, definitionFor, hierarchyAliasesFor, normalize: normalizeSproModule } = require('./sproModules');
const SUPABASE_URL=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_SERVICE_ROLE_KEY=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'');

function configured(){ return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY); }
function requireConfigured(){ if(!configured()) throw new Error('Supabase administration is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); }

async function request(path, options={}){
  requireConfigured();
  const headers={
    apikey:SUPABASE_SERVICE_ROLE_KEY,
    Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type':'application/json',
    Prefer:'return=representation',
    ...(options.headers||{})
  };
  const r=await fetch(`${SUPABASE_URL}${path}`,{...options,headers});
  const text=await r.text();
  let body=null; try{body=text?JSON.parse(text):null;}catch{body=text;}
  if(!r.ok){
    const msg=body?.message||body?.error_description||body?.hint||body?.details||body?.error||text||`HTTP ${r.status}`;
    const e=new Error(msg); e.status=r.status; throw e;
  }
  return body;
}

function normalizeEmail(value){
  return String(value??'').trim().toLowerCase();
}

function isActiveUser(user){
  return user?.is_active===true || String(user?.is_active??'').trim().toLowerCase()==='true' || String(user?.is_active??'').trim()==='1';
}

async function getUserByIdentity(identity){
  requireConfigured();
  const id=String(identity?.userId||'').trim();
  const email=normalizeEmail(identity?.email);
  const select='user_id,user_email,display_name,role,is_active';
  const diagnostics={email,byId:0,exact:0,ilike:0,all:0,normalized:0};

  if(id){
    const rows=await request(`/rest/v1/iconfig_users?user_id=eq.${encodeURIComponent(id)}&select=${select}`);
    diagnostics.byId=rows?.length||0;
    if(rows?.[0])return rows[0];
  }
  if(!email)return null;

  const exact=await request(`/rest/v1/iconfig_users?user_email=eq.${encodeURIComponent(email)}&select=${select}`);
  diagnostics.exact=exact?.length||0;
  if(exact?.[0])return exact[0];

  const insensitive=await request(`/rest/v1/iconfig_users?user_email=ilike.${encodeURIComponent(email)}&select=${select}`);
  diagnostics.ilike=insensitive?.length||0;
  if(insensitive?.[0])return insensitive[0];

  const rows=await request(`/rest/v1/iconfig_users?select=${select}&limit=1000`);
  diagnostics.all=rows?.length||0;
  const normalized=rows.find(row=>normalizeEmail(row?.user_email)===email);
  diagnostics.normalized=normalized?1:0;
  if(normalized)return normalized;

  const error=new Error(`No iconfig_users row matched ${email}. Supabase query succeeded but returned no matching user.`);
  error.code='USER_NOT_FOUND';
  error.authDiagnostics=diagnostics;
  return null;
}
async function diagnoseUserLookup(identity){
  requireConfigured();
  const email=normalizeEmail(identity);
  if(!email)return {supabaseHost:new URL(SUPABASE_URL).host,exactCount:0,ilikeCount:0,normalizedMatchCount:0,match:null};
  const select='user_id,user_email,display_name,role,is_active';
  const exact=await request(`/rest/v1/iconfig_users?user_email=eq.${encodeURIComponent(email)}&select=${select}`);
  const insensitive=await request(`/rest/v1/iconfig_users?user_email=ilike.${encodeURIComponent(email)}&select=${select}`);
  const rows=await request(`/rest/v1/iconfig_users?select=${select}&limit=1000`);
  const match=rows.find(row=>normalizeEmail(row?.user_email)===email) || null;
  return {supabaseHost:new URL(SUPABASE_URL).host,exactCount:exact?.length||0,ilikeCount:insensitive?.length||0,normalizedMatchCount:match?1:0,match};
}



const SPRO_HIERARCHY_TABLE = 'spro_l1_l6_sequence';

function isCanonicalSapRoot(row){
  const level=Number(row?.level_no||0);
  const treeId=String(row?.tree_id||'').trim();
  const nodeId=String(row?.node_id||'').trim();
  const parent=String(row?.parent_node_id||'').trim();
  if(level!==1 || !treeId || !nodeId || parent) return false;

  // SAP SPROHierarchySet returns the root node as <TREE_ID>_T.
  // Example from the verified Logistics - General OData response:
  // TreeId=LO01, NodeId=LO01_T, NodeLevel=01, ParentNodeId=<empty>.
  // A legacy Enterprise-Structure branch that was merely re-rooted can have
  // level 1 and no parent but will retain a different node id; reject it.
  return nodeId===`${treeId}_T`;
}

function validateSproHierarchyCache(rows,moduleName,moduleCode){
  if(!Array.isArray(rows)||!rows.length) return false;

  const expectedName=String(definitionFor(moduleCode||moduleName)?.name||moduleName||'').trim().toUpperCase();
  const active=rows.filter(row=>row?.is_active!==false && row?.hierarchy_complete===true);
  if(!active.length) return false;

  const roots=active.filter(row=>Number(row.level_no||0)===1 && !String(row.parent_node_id||'').trim());
  if(roots.length!==1) return false;

  const root=roots[0];
  const rootName=String(root.node_name||root.node_text||'').trim().toUpperCase();
  if(rootName!==expectedName) return false;
  const sourceSystem=String(root.source_system||'').trim().toUpperCase();
  // Only a hierarchy returned for the module's own SAP SPRO structure is a
  // valid runtime cache. Enterprise-Structure branch re-rooting is not the
  // SPRO module hierarchy and must never remain authoritative in cache.
  if(sourceSystem==='ODATA-BRANCH') return false;
  if(!isCanonicalSapRoot(root)) return false;

  const treeId=String(root.tree_id||'').trim();
  const nodeIds=new Set(active.map(row=>String(row.node_id||'').trim()).filter(Boolean));
  for(const row of active){
    if(String(row.tree_id||'').trim()!==treeId) return false;
    const level=Number(row.level_no||0);
    if(level<1 || level>6) return false;

    const parent=String(row.parent_node_id||'').trim();
    if(level===1 && parent) return false;
    if(parent && !nodeIds.has(parent)) return false;
  }

  // A hierarchy containing only its root is not a usable module hierarchy.
  return active.length>1;
}

async function listSproHierarchy(moduleCodeOrName, language='E'){
  const requested=normalizeSproModule(moduleCodeOrName);
  const lang=String(language||'E').trim() || 'E';
  if(!requested) return [];

  const code=codeFor(requested);
  const definition=definitionFor(code || requested);
  const moduleCode=definition?.code || code || requested;
  const moduleName=definition?.name || requested;
  const aliases=hierarchyAliasesFor(moduleCode);

  // Canonical module cache only. Legacy branch extraction below is never used
  // for cache reads; it is restricted to the SAP-derived sparse-result fallback
  // in server/routes/tree.js.
  //
  // IMPORTANT:
  // We deliberately do NOT read Enterprise Structure and extract/re-root
  // FI/CO/LG/MM/SD/etc. A module must have its own complete SAP hierarchy.
  if(moduleCode){
    try{
      const byCode=await request(
        `/rest/v1/${SPRO_HIERARCHY_TABLE}?module_code=eq.${encodeURIComponent(moduleCode)}&language=eq.${encodeURIComponent(lang)}&is_active=eq.true&hierarchy_complete=eq.true&select=*&order=level_no.asc,parent_node_id.asc.nullslast,sequence_no.asc`
      );
      if(Array.isArray(byCode)&&byCode.length&&validateSproHierarchyCache(byCode,moduleName,moduleCode)){
        return byCode.map(row=>({
          ...row,
          module_code:row.module_code||moduleCode,
          module_name:row.module_name||moduleName
        }));
      }
    }catch(e){
      // Treat a cache read failure as unavailable cache; the caller will use
      // SAP OData rather than falling back to a static or mixed hierarchy.
    }
  }

  // Legacy rows may have module_name but no module_code. Accept them only
  // when they are already a complete SAP-rooted hierarchy. Never extract a
  // branch from Enterprise Structure.
  const names=[moduleName,...aliases.filter(x=>String(x).trim().toUpperCase()!==moduleName.toUpperCase())];
  for(const name of names){
    try{
      const rows=await request(
        `/rest/v1/${SPRO_HIERARCHY_TABLE}?module_name=eq.${encodeURIComponent(name)}&language=eq.${encodeURIComponent(lang)}&is_active=eq.true&hierarchy_complete=eq.true&select=*&order=level_no.asc,parent_node_id.asc.nullslast,sequence_no.asc`
      );
      if(Array.isArray(rows)&&rows.length&&validateSproHierarchyCache(rows,moduleName,moduleCode)){
        return rows.map(row=>({
          ...row,
          module_code:row.module_code||moduleCode,
          module_name:row.module_name||moduleName
        }));
      }
    }catch(e){
      // Continue to OData on cache miss.
    }
  }

  return [];
}

async function hasSproHierarchy(moduleName, language='E'){
  const rows=await listSproHierarchy(moduleName,language);
  return Array.isArray(rows) && rows.length>0;
}

async function replaceSproHierarchy(rows){
  requireConfigured();
  const normalized=(rows||[]).filter(Boolean).map(row=>({
    module_code:codeFor(row.module_code||row.module_name)||null,
    module_name:String(row.module_name||definitionFor(row.module_code)?.name||'').trim(),
    language:String(row.language||'E').trim() || 'E',
    tree_id:String(row.tree_id||'').trim(),
    node_id:String(row.node_id||'').trim(),
    parent_node_id:row.parent_node_id==null||String(row.parent_node_id).trim()===''?null:String(row.parent_node_id).trim(),
    brother_id:row.brother_id==null||String(row.brother_id).trim()===''?null:String(row.brother_id).trim(),
    level_no:Number(row.level_no||1),
    sequence_no:Number(row.sequence_no||1),
    node_name:String(row.node_name||'').trim(),
    node_text:row.node_text==null?null:String(row.node_text),
    tree_text:row.tree_text==null?null:String(row.tree_text),
    node_type:row.node_type==null?null:String(row.node_type),
    activity:row.activity==null?null:String(row.activity),
    reference_type:row.reference_type==null?null:String(row.reference_type),
    reference_object:row.reference_object==null?null:String(row.reference_object),
    customizing_object:row.customizing_object==null?null:String(row.customizing_object),
    table_name:row.table_name==null?null:String(row.table_name),
    source_system:String(row.source_system||'ODATA').trim().toUpperCase() || 'ODATA',
    hierarchy_complete:true,
    is_active:true,
    updated_at:new Date().toISOString()
  })).filter(row=>row.module_name && row.tree_id && row.node_id && row.node_name);

  // PostgREST rejects an upsert when the same unique key occurs twice in the
  // same request chunk (ON CONFLICT DO UPDATE cannot affect one row twice).
  // SAP payloads can contain repeated node identities in some modules. Keep
  // one deterministic row per canonical module/language/tree/node key.
  const unique = new Map();
  for(const row of normalized){
    const key = [row.module_code || '', row.language, row.tree_id, row.node_id].join('#');
    if(!unique.has(key)) unique.set(key,row);
  }
  const deduped = [...unique.values()];

  if(!deduped.length) return [];

  const moduleName=deduped[0].module_name;
  const language=deduped[0].language;
  await request(`/rest/v1/${SPRO_HIERARCHY_TABLE}?module_code=eq.${encodeURIComponent(codeFor(moduleName)||moduleName)}&language=eq.${encodeURIComponent(language)}`,{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  });

  const chunkSize=500;
  const stored=[];
  for(let i=0;i<deduped.length;i+=chunkSize){
    const chunk=deduped.slice(i,i+chunkSize);
    const result=await request(`/rest/v1/${SPRO_HIERARCHY_TABLE}?on_conflict=module_code,language,tree_id,node_id`,{
      method:'POST',
      body:JSON.stringify(chunk),
      headers:{Prefer:'resolution=merge-duplicates,return=representation'}
    });
    if(Array.isArray(result)) stored.push(...result);
  }
  return stored;
}

async function listModules(){
  return request('/rest/v1/spro_modules?is_active=eq.true&select=module_id,module_code,module_name,display_order&order=display_order.asc');
}
async function listProjects(){
  const projects=await request('/rest/v1/iconfig_projects?select=project_id,project_name,project_description,status,created_by,created_at,updated_at&order=project_name.asc');
  return Promise.all((projects||[]).filter(p=>String(p.status||'ACTIVE').toUpperCase()==='ACTIVE').map(async p=>({...p,modules:await listProjectModules(p.project_id)})));
}
async function createProject({name,description,createdBy}){
  const rows=await request('/rest/v1/iconfig_projects',{method:'POST',body:JSON.stringify({project_name:name,project_description:description||null,created_by:createdBy,status:'ACTIVE'})});
  return rows?.[0];
}
async function deleteProject(projectId){
  const id=String(projectId||'').trim();
  if(!id) throw new Error('Project ID is required.');

  // Remove the project-module assignments first so deletion remains safe even
  // when the database foreign key does not use ON DELETE CASCADE.
  await request(`/rest/v1/iconfig_project_modules?project_id=eq.${encodeURIComponent(id)}`,{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  });

  await request(`/rest/v1/iconfig_projects?project_id=eq.${encodeURIComponent(id)}`,{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  });

  return {project_id:id};
}
async function listProjectModules(projectId){
  return request(`/rest/v1/iconfig_project_modules?project_id=eq.${encodeURIComponent(projectId)}&select=module_id,selected_by,selected_at,module:spro_modules(module_id,module_code,module_name,display_order)&order=module_id.asc`);
}
async function saveProjectModules(projectId,moduleIds,selectedBy){
  const current=await request(`/rest/v1/iconfig_project_modules?project_id=eq.${encodeURIComponent(projectId)}&select=module_id`);
  const wanted=new Set((moduleIds||[]).map(Number));
  const existing=new Set((current||[]).map(x=>Number(x.module_id)));
  const add=[...wanted].filter(id=>!existing.has(id)).map(module_id=>({project_id:projectId,module_id,selected_by:selectedBy}));
  if(add.length)await request('/rest/v1/iconfig_project_modules',{method:'POST',body:JSON.stringify(add),headers:{Prefer:'resolution=ignore-duplicates,return=representation'}});
  const remove=[...existing].filter(id=>!wanted.has(id));
  for(const moduleId of remove){
    await request(`/rest/v1/iconfig_project_modules?project_id=eq.${encodeURIComponent(projectId)}&module_id=eq.${encodeURIComponent(moduleId)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  }
  return listProjectModules(projectId);
}

async function listDeploymentVersions({projectId,bcsetId,targetClient,limit=20}){
  requireConfigured();
  const params=[
    'select=id,project_id,bcset_id,target_client,version,status,payload_hash,record_count,value_count,deployed_by,deployed_at,overwrite_of_version,result,field_diff',
    projectId ? `project_id=eq.${encodeURIComponent(projectId)}` : null,
    `bcset_id=eq.${encodeURIComponent(bcsetId)}`,
    `target_client=eq.${encodeURIComponent(targetClient)}`,
    `order=version.desc`,
    `limit=${Math.max(1,Math.min(Number(limit)||20,100))}`
  ].filter(Boolean).join('&');
  return request(`/rest/v1/iconfig_gold_deployments?${params}`);
}

async function getLatestDeployment({projectId,bcsetId,targetClient}){
  const rows=await listDeploymentVersions({projectId,bcsetId,targetClient,limit:1});
  return rows?.[0] || null;
}
async function getDeploymentVersionById(id){
  requireConfigured();
  const rows=await request(`/rest/v1/iconfig_gold_deployments?id=eq.${encodeURIComponent(String(id))}&select=id,project_id,bcset_id,target_client,version,status,payload_hash,payload,record_count,value_count,deployed_by,deployed_at,overwrite_of_version,result,field_diff&limit=1`);
  return rows?.[0] || null;
}

async function createDeploymentVersion(data){
  requireConfigured();
  const rows=await request('/rest/v1/iconfig_gold_deployments',{
    method:'POST',
    body:JSON.stringify(data)
  });
  return rows?.[0] || null;
}

async function nextDeploymentVersion({projectId,bcsetId,targetClient}){
  const latest=await getLatestDeployment({projectId,bcsetId,targetClient});
  return {version:(Number(latest?.version)||0)+1,latest};
}

async function listAuditLogs({projectId='',limit=100}={}){
  requireConfigured();
  const params=[
    'select=id,project_id,user_id,user_email,display_name,action,entity_type,entity_id,entity_name,details,created_at',
    projectId ? `project_id=eq.${encodeURIComponent(projectId)}` : null,
    'order=created_at.desc',
    `limit=${Math.max(1,Math.min(Number(limit)||100,500))}`
  ].filter(Boolean).join('&');
  return request(`/rest/v1/iconfig_audit_log?${params}`);
}

async function writeAuditLog(data){
  requireConfigured();
  const rows=await request('/rest/v1/iconfig_audit_log',{
    method:'POST',
    body:JSON.stringify({
      project_id:data.projectId||null,
      user_id:data.userId||null,
      user_email:data.userEmail||null,
      display_name:data.displayName||null,
      action:String(data.action||'').trim(),
      entity_type:data.entityType||null,
      entity_id:data.entityId||null,
      entity_name:data.entityName||null,
      details:data.details||{}
    })
  });
  return rows?.[0] || null;
}

module.exports={configured,getUserByIdentity,diagnoseUserLookup,listModules,listProjects,createProject,deleteProject,listProjectModules,saveProjectModules,listSproHierarchy,hasSproHierarchy,replaceSproHierarchy,
  listDeploymentVersions,getLatestDeployment,getDeploymentVersionById,createDeploymentVersion,nextDeploymentVersion,
  listAuditLogs,writeAuditLog
};
