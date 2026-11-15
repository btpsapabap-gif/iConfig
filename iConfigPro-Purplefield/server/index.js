const fs=require('fs');
const path=require('path');
const dotenv=require('dotenv');

// Always load the project-local .env, regardless of the directory from which
// `npm start`/`node server/index.js` is launched. This is important on Windows
// where the terminal working directory may be a parent folder. Keep platform
// environment variables authoritative; the .env only fills missing values.
const envCandidates=[
  path.join(__dirname,'..','.env'),
  path.join(process.cwd(),'.env'),
  path.join(__dirname,'..','..','.env')
];
const envFile=envCandidates.find(file=>fs.existsSync(file))||envCandidates[0];
if(fs.existsSync(envFile)) {
  const raw=fs.readFileSync(envFile,'utf8').replace(/^\uFEFF/,'');
  const parsed=dotenv.parse(raw);
  for(const [key,value] of Object.entries(parsed)) {
    process.env[key]=value;
  }
}

const express=require('express');
const {router:treeRouter}=require('./routes/tree');
const {selectSourceProvenance,tableKeyFields}=require('./provenance');const layers=require('./routes/layers');const {isConfigured,isDeployConfigured,listBcSets,fetchBcSetValues,fetchDdicFields,fetchSourceDeployMetadata,postDeploy,SAP,DEPLOY,mode,targetMode}=require('./sapClient');
const auth=require('./auth');
const supabaseAdmin=require('./supabaseAdmin');
const {compareDeployments,hashDeployment}=require('./deploymentVersioning');
const app=express();const PORT=parseInt(process.env.PORT||'4000',10);
const crypto=require('crypto');
const localSessions=new Map();
const LOCAL_SESSION_COOKIE='iconfig_session';
function cookieValue(req,name){const raw=String(req.headers.cookie||'');for(const part of raw.split(';')){const [k,...v]=part.trim().split('=');if(k===name)return decodeURIComponent(v.join('='));}return ''; }
function localSession(req){if(auth.enabled)return null;const token=cookieValue(req,LOCAL_SESSION_COOKIE);return token&&localSessions.get(token)||null;}
function setLocalSession(res,user){const token=crypto.randomBytes(32).toString('hex');localSessions.set(token,{userId:String(user.user_id),email:String(user.user_email||'').toLowerCase(),displayName:String(user.display_name||'')});res.setHeader('Set-Cookie',`${LOCAL_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);}
function clearLocalSession(req,res){const token=cookieValue(req,LOCAL_SESSION_COOKIE);if(token)localSessions.delete(token);res.setHeader('Set-Cookie',`${LOCAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);}

// BTP uses this unauthenticated endpoint for liveness. All application routes
// registered below it require a validated XSUAA JWT in production.
app.get('/api/health',(req,res)=>res.json({ok:true,mode,targetMode,node:'20.x',time:new Date().toISOString()}));
auth.configure(app);
app.use(express.json({limit:'5mb'}));
app.use((req,res,next)=>{ if(req.path==='/'||req.path.endsWith('.js')||req.path.endsWith('.css')||req.path.endsWith('.html')) res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate'); next(); });
app.use(express.static(path.join(__dirname,'..','public'),{etag:false,lastModified:false,maxAge:0}));

function requestIdentity(req){
  const session=localSession(req);
  const candidates=[session,req.user,req.authInfo,req.authInfo?.getTokenInfo?.(),req.authInfo?.getTokenValue?.()];
  let userId='',email='',displayName='';
  for(const c of candidates){
    if(!c)continue;
    const get=(name)=>{try{if(typeof c[name]==='function')return c[name]();}catch{} return c[name];};
    userId=userId||get('userId')||get('user_id')||get('sub')||get('user_uuid')||'';
    email=email||get('email')||get('userEmail')||get('user_email')||'';
    displayName=displayName||get('displayName')||get('name')||get('given_name')||'';
    if(c.userInfo){userId=userId||c.userInfo.userId||c.userInfo.sub||'';email=email||c.userInfo.email||'';displayName=displayName||c.userInfo.name||'';}
  }
  if(!email&&!session&&!auth.enabled&&process.env.LOCAL_USER_EMAIL)email=process.env.LOCAL_USER_EMAIL;
  if(!userId&&!session&&!auth.enabled&&process.env.LOCAL_USER_ID)userId=process.env.LOCAL_USER_ID;
  return {userId:String(userId||''),email:String(email||'').toLowerCase(),displayName:String(displayName||'')};
}
async function requireUser(req,res,next){
  try{
    if(!supabaseAdmin.configured())return res.status(503).json({error:'Supabase administration is not configured.'});
    const identity=requestIdentity(req);
    const user=await supabaseAdmin.getUserByIdentity(identity);
    const active=user?.is_active===true || String(user?.is_active??'').trim().toLowerCase()==='true' || String(user?.is_active??'').trim()==='1';
    if(!user||!active)return res.status(403).json({error:'Authenticated active iConfigPro user is required.'});
    req.iconfigUser=user;req.iconfigIdentity=identity;next();
  }catch(e){res.status(e.status===401?401:500).json({error:e.message});}
}
async function requireAdmin(req,res,next){
  return requireUser(req,res,()=>{
    if(String(req.iconfigUser?.role||'').trim().toUpperCase()!=='ADMIN'){
      return res.status(403).json({error:'Forbidden: ADMIN role required.'});
    }
    next();
  });
}

app.get('/api/session',async(req,res)=>{
  try{
    const identity=requestIdentity(req);
    if(!supabaseAdmin.configured())return res.json({authenticated:false,mode:auth.enabled?'xsuaa':'local',configured:false});
    const user=await supabaseAdmin.getUserByIdentity(identity);
    res.json({authenticated:Boolean(user&&user.is_active)||auth.enabled||Boolean(localSession(req)),mode:auth.enabled?'xsuaa':'local',configured:true,user:user?{user_id:user.user_id,user_email:user.user_email,display_name:user.display_name,role:user.role,is_active:user.is_active}:null});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/auth/diagnostic',async(req,res)=>{
  try{
    if(!supabaseAdmin.configured())return res.status(503).json({ok:false,configured:false,error:'Supabase administration is not configured.'});
    const supplied=String(req.query?.email||'').trim().toLowerCase();
    const result=await supabaseAdmin.diagnoseUserLookup(supplied);
    res.json({ok:true,configured:true,supabaseHost:result.supabaseHost,email:supplied||null,exactCount:result.exactCount,ilikeCount:result.ilikeCount,normalizedMatchCount:result.normalizedMatchCount,match:result.match?{user_id:result.match.user_id,user_email:result.match.user_email,display_name:result.match.display_name,role:result.match.role,is_active:result.match.is_active}:null});
  }catch(e){res.status(e.status===401?401:502).json({ok:false,error:e.message,status:e.status||null});}
});
app.post('/api/login',async(req,res)=>{
  if(auth.enabled)return res.status(400).json({error:'BTP/XSUAA authentication is handled by the platform login flow.'});
  try{
    if(!supabaseAdmin.configured())return res.status(503).json({error:'Supabase administration is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'});
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!email)return res.status(400).json({error:'Email is required.'});
    const user=await supabaseAdmin.getUserByIdentity({email});
    if(!user){
      return res.status(403).json({
        error:'User is not registered or is inactive.',
        code:'USER_NOT_FOUND',
        detail:'The Supabase iconfig_users query succeeded but returned no row matching this email.',
        supabaseHost:new URL(process.env.SUPABASE_URL).host
      });
    }
    const active=user.is_active===true || String(user.is_active??'').trim().toLowerCase()==='true' || String(user.is_active??'').trim()==='1';
    if(!active){
      return res.status(403).json({error:'User is not registered or is inactive.',code:'USER_INACTIVE',user_email:user.user_email,is_active:user.is_active});
    }
    setLocalSession(res,user);
    res.json({ok:true,user:{user_id:user.user_id,user_email:user.user_email,display_name:user.display_name,role:user.role,is_active:user.is_active},isAdmin:String(user.role||'').trim().toUpperCase()==='ADMIN'});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/logout',(req,res)=>{clearLocalSession(req,res);res.json({ok:true});});

app.get('/api/admin/me',async(req,res)=>{
  try{
    if(!supabaseAdmin.configured())return res.json({configured:false,authenticated:auth.enabled,role:null});
    const identity=requestIdentity(req); const user=await supabaseAdmin.getUserByIdentity(identity);
    res.json({configured:true,authenticated:auth.enabled||Boolean(identity.email||identity.userId),identity,user:user?{user_id:user.user_id,user_email:user.user_email,display_name:user.display_name,is_active:user.is_active}:null});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/admin/modules',requireUser,async(req,res)=>{try{res.json({modules:await supabaseAdmin.listModules()});}catch(e){res.status(502).json({error:e.message});}});
app.get('/api/admin/projects',requireUser,async(req,res)=>{try{res.json({projects:await supabaseAdmin.listProjects()});}catch(e){res.status(502).json({error:e.message});}});
app.post('/api/admin/projects',requireUser,async(req,res)=>{try{const name=String(req.body?.projectName||'').trim();if(!name)return res.status(400).json({error:'Project name is required.'});const project=await supabaseAdmin.createProject({name,description:String(req.body?.description||'').trim(),createdBy:req.iconfigUser.user_id});
    try{await supabaseAdmin.writeAuditLog({projectId:project?.project_id,userId:req.iconfigUser.user_id,userEmail:req.iconfigUser.user_email,displayName:req.iconfigUser.display_name,action:'PROJECT_CREATED',entityType:'PROJECT',entityId:project?.project_id,entityName:name,details:{description:String(req.body?.description||'').trim()}});}catch(auditErr){console.warn('[audit] project create log failed:',auditErr.message);}
    res.status(201).json({project});}catch(e){res.status(e.status===409?409:502).json({error:e.message});}});
app.delete('/api/admin/projects/:projectId',requireUser,async(req,res)=>{try{const projectId=String(req.params.projectId||'').trim();if(!projectId)return res.status(400).json({error:'Project ID is required.'});const result=await supabaseAdmin.deleteProject(projectId);
    try{await supabaseAdmin.writeAuditLog({projectId,userId:req.iconfigUser.user_id,userEmail:req.iconfigUser.user_email,displayName:req.iconfigUser.display_name,action:'PROJECT_DELETED',entityType:'PROJECT',entityId:projectId,entityName:projectId,details:{}});}catch(auditErr){console.warn('[audit] project delete log failed:',auditErr.message);}
    res.json({ok:true,projectId:result.project_id});}catch(e){res.status(e.status===404?404:e.status===409?409:502).json({error:e.message});}});
app.get('/api/admin/projects/:projectId/modules',requireUser,async(req,res)=>{try{res.json({modules:await supabaseAdmin.listProjectModules(req.params.projectId)});}catch(e){res.status(502).json({error:e.message});}});
app.put('/api/admin/projects/:projectId/modules',requireUser,async(req,res)=>{try{const ids=Array.isArray(req.body?.moduleIds)?req.body.moduleIds:[];const modules=await supabaseAdmin.saveProjectModules(req.params.projectId,ids,req.iconfigUser.user_id);
    try{await supabaseAdmin.writeAuditLog({projectId:req.params.projectId,userId:req.iconfigUser.user_id,userEmail:req.iconfigUser.user_email,displayName:req.iconfigUser.display_name,action:'PROJECT_MODULES_UPDATED',entityType:'PROJECT',entityId:req.params.projectId,details:{moduleIds:ids}});}catch(auditErr){console.warn('[audit] module update log failed:',auditErr.message);}
    res.json({modules});}catch(e){res.status(502).json({error:e.message});}});

app.get('/api/config',(req,res)=>res.json({mode,targetMode,dataModeRaw:process.env.DATA_MODE||'',targetModeRaw:process.env.TARGET_MODE||'',sapConfigured:isConfigured()||mode==='mock',sapHost:SAP.host?`${SAP.protocol}://${SAP.host}:${SAP.port}`:'mock',sapClient:SAP.client,bcsetId:process.env.SAP_BCSET_ID||'DEMO_E2E',deployClient:process.env.SAP_DEPLOY_CLIENT||process.env.SAP_CLIENT||'200',deployConfigured:isDeployConfigured(),deployHost:DEPLOY.host?`${DEPLOY.protocol}://${DEPLOY.host}:${DEPLOY.port}`:'mock',envFile:fs.existsSync(envFile)?'.env':'not-found'}));
app.get('/api/bcsets',async(req,res)=>{try{res.json({bcsets:await listBcSets(req.query.refresh==='1'),default:process.env.SAP_BCSET_ID||'DEMO_E2E'})}catch(e){res.status(502).json({error:e.message})}});
app.get('/api/table-metadata',(req,res)=>{try{const p=path.join(__dirname,'..','data','tableMetadata.json');res.json({tables:JSON.parse(fs.readFileSync(p,'utf8'))})}catch(e){res.status(500).json({error:e.message})}});app.get('/api/table-fields',async(req,res)=>{
  const table=String(req.query?.table||'').trim().toUpperCase();
  if(!table)return res.status(400).json({error:'Table is required'});
  try{
    const fields=await fetchDdicFields(table);
    res.json({table,fields,source:'SAP ZIM_DDIC_FIELDS_SRV'});
  }catch(e){
    res.status(502).json({error:`Could not read DDIC fields for ${table}: ${e.message}`});
  }
});
app.use('/api/tree',treeRouter);app.use('/api/layers',layers);
app.get('/api/deploy/provenance',async(req,res)=>{
  const bcsetId=String(req.query.bcsetId||'').trim();
  const tables=String(req.query.tables||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  if(!bcsetId)return res.status(400).json({ok:false,error:'bcsetId is required'});
  if(mode!=='sap')return res.json({ok:true,mode,diagnostics:{note:'Provenance preflight is live only in SAP mode'}});
  try{
    const sourceMeta=await fetchSourceDeployMetadata(bcsetId,tables);
    const values=await require('./sapClient').fetchBcSetValues(bcsetId,true);
    res.json({
      ok:Boolean(sourceMeta.e071?.length&&sourceMeta.e071k?.length),
      bcsetId,
      tables,
      sourceE071Rows:sourceMeta.e071?.length||0,
      sourceE071KRows:sourceMeta.e071k?.length||0,
      sourceValueRows:values?.length||0,
      sourceRecAttrRows:sourceMeta.recattr?.length||0,
      available:Boolean(sourceMeta.available),
      diagnostics:sourceMeta.diagnostics||{}
    });
  }catch(e){
    res.status(502).json({ok:false,bcsetId,tables,error:e.message});
  }
});

app.post('/api/deploy/check',auth.requireScope('Deploy'),requireUser,async(req,res)=>{
  const {projectId,targetClient,DeployTableSet}=req.body||{};
  const bcsetId=String(req.body?.bcsetId||'').trim();
  if(!bcsetId)return res.status(400).json({error:'bcsetId is required'});
  if(!projectId)return res.status(400).json({error:'Select a project before deploying Gold.'});
  if(!Array.isArray(DeployTableSet)||!DeployTableSet.length)return res.status(400).json({error:'DeployTableSet is empty'});
  if(!supabaseAdmin.configured()){
    return res.json({ok:true,historyAvailable:false,alreadyDeployed:false,version:null,latest:null,diff:null});
  }
  try{
    const latest=await supabaseAdmin.getLatestDeployment({projectId:String(projectId||'').trim()||null,bcsetId:String(bcsetId),targetClient:String(targetClient||'')});
    if(!latest)return res.json({ok:true,historyAvailable:true,alreadyDeployed:false,version:1,latest:null,diff:null});
    const diff=compareDeployments(latest.payload||{}, {DeployTableSet});
    res.json({ok:true,historyAvailable:true,alreadyDeployed:diff.unchanged,version:Number(latest.version||0)+1,latest:{
      id:latest.id,version:latest.version,status:latest.status,deployedAt:latest.deployed_at,deployedBy:latest.display_name||latest.user_email||latest.deployed_by,
      payloadHash:latest.payload_hash,recordCount:latest.record_count,valueCount:latest.value_count
    },diff});
  }catch(e){res.status(502).json({ok:false,error:e.message});}
});

app.get('/api/deploy/versions',requireUser,async(req,res)=>{
  const bcsetId=String(req.query.bcsetId||'').trim();
  const targetClient=String(req.query.targetClient||'').trim();
  const projectId=String(req.query.projectId||'').trim();
  if(!bcsetId||!targetClient)return res.status(400).json({error:'bcsetId and targetClient are required'});
  if(!supabaseAdmin.configured())return res.json({historyAvailable:false,versions:[]});
  try{
    const versions=await supabaseAdmin.listDeploymentVersions({projectId:projectId||null,bcsetId,targetClient,limit:50});
    res.json({historyAvailable:true,versions});
  }catch(e){res.status(502).json({error:e.message});}
});
app.get('/api/deploy/versions/:id',requireUser,async(req,res)=>{
  const id=String(req.params.id||'').trim();
  if(!id)return res.status(400).json({error:'Deployment version ID is required'});
  if(!supabaseAdmin.configured())return res.status(503).json({error:'Deployment history is not configured.'});
  try{
    const version=await supabaseAdmin.getDeploymentVersionById(id);
    if(!version)return res.status(404).json({error:'Deployment version not found.'});
    res.json({historyAvailable:true,version});
  }catch(e){res.status(502).json({error:e.message});}
});

app.get('/api/audit-log',requireUser,async(req,res)=>{
  if(!supabaseAdmin.configured())return res.json({historyAvailable:false,logs:[]});
  try{
    const projectId=String(req.query.projectId||'').trim();
    const logs=await supabaseAdmin.listAuditLogs({projectId,limit:req.query.limit||100});
    res.json({historyAvailable:true,logs});
  }catch(e){res.status(502).json({error:e.message});}
});

app.post('/api/deploy',auth.requireScope('Deploy'),async(req,res)=>{
  const {bcsetId,bcsetText,trkorr,activate,targetClient,DeployTableSet,projectId,overwrite}=req.body||{};
  const goldBcsetName=String(req.body?.goldBcsetName||bcsetId||'').trim();
  const historyBcsetId=goldBcsetName||bcsetId;
  if(!bcsetId)return res.status(400).json({error:'bcsetId is required'});
  if(!projectId)return res.status(400).json({error:'Select a project before deploying Gold.'});
  if(!Array.isArray(DeployTableSet)||!DeployTableSet.length)return res.status(400).json({error:'DeployTableSet is empty'});
  try{
    let latestDeployment=null;
    let deploymentDiff=null;
    if(supabaseAdmin.configured()){
      try{
        latestDeployment=await supabaseAdmin.getLatestDeployment({projectId:String(projectId||'').trim()||null,bcsetId:historyBcsetId,targetClient:String(targetClient||'')});
        if(latestDeployment){
          deploymentDiff=compareDeployments(latestDeployment.payload||{}, {DeployTableSet});
          if(deploymentDiff.unchanged && !overwrite){
            return res.status(409).json({
              ok:false,code:'ALREADY_DEPLOYED',
              error:`This Gold payload is already deployed as version ${latestDeployment.version}. Confirm "Already deployed, want to overwrite it" to deploy it again.`,
              version:latestDeployment.version,diff:deploymentDiff
            });
          }
        }
      }catch(historyCheckErr){
        console.warn('[deployment-history] preflight unavailable:',historyCheckErr.message);
      }
    }
    const tableNames=DeployTableSet.map(t=>t.Tablename).filter(Boolean);
    let sourceMeta={e071:[],e071k:[],sourceE071:[],recattr:[],values:[],available:false,diagnostics:{}};

    if(String(process.env.SAP_DEPLOY_SEND_SOURCE_METADATA||'true').toLowerCase()!=='false'&&mode==='sap'){
      try{
        sourceMeta=await fetchSourceDeployMetadata(bcsetId,tableNames);
        // BCSetValueSet is source-record data used only for provenance
        // resolution. It is never posted to the target service.
        sourceMeta.values=await require('./sapClient').fetchBcSetValues(bcsetId,true);
      }catch(metaErr){
        console.error('[deploy] source metadata unavailable:',metaErr.stack||metaErr.message);
        return res.status(502).json({
          ok:false,
          error:`Source E071/E071K metadata could not be read for ${bcsetId}: ${metaErr.message}`,
          diagnostics:sourceMeta.diagnostics||{bcsetId,tableNames}
        });
      }

      if(!sourceMeta.available){
        return res.status(502).json({
          ok:false,
          error:`Source E071/E071K metadata is unavailable for BC Set ${bcsetId}; deployment was NOT posted to the target.`,
          diagnostics:sourceMeta.diagnostics||{bcsetId,tableNames}
        });
      }

      // tableMetadata.json is a UI/development baseline, not the authoritative
      // SAP DDIC. Some process-directory tables may not be present in that file.
      // Load missing key definitions directly from the SAP DDIC service so a
      // changed key field can still produce a target TABKEY. Existing source
      // rows retain the E071K fallback when the final Silver row is incomplete.
      const ddicKeyFieldsByTable={};
      const missingDdicTables=tableNames.filter(table=>!tableKeyFields(table));
      if(missingDdicTables.length){
        const results=await Promise.all(missingDdicTables.map(async table=>{
          try{
            const fields=await fetchDdicFields(table);
            const keys=fields.filter(f=>f.key&&f.fieldName&&f.fieldName!=='MANDT'&&f.fieldName!=='SPRAS')
              .sort((a,b)=>(a.position||0)-(b.position||0))
              .map(f=>String(f.fieldName).trim().toUpperCase())
              .filter(Boolean);
            return {table,keys,error:''};
          }catch(e){
            return {table,keys:[],error:e.message};
          }
        }));
        for(const r of results) if(r.keys.length) ddicKeyFieldsByTable[r.table]=r.keys;
        sourceMeta.diagnostics={...(sourceMeta.diagnostics||{}),dynamicDdicKeyTables:Object.keys(ddicKeyFieldsByTable),dynamicDdicKeyErrors:results.filter(r=>r.error).map(r=>({table:r.table,error:r.error}))};
      }

      const provenance=selectSourceProvenance({
        deployTableSet:DeployTableSet,
        sourceMeta,
        sourceClient:SAP.client,
        targetClient:targetClient||process.env.SAP_DEPLOY_CLIENT||process.env.SAP_CLIENT||'',
        ddicKeyFieldsByTable
      });

      if(!provenance.sourceE071.length || provenance.unresolved.length){
        const details=provenance.unresolved.length
          ? ` Unresolved: ${JSON.stringify(provenance.unresolved.slice(0,10))}`
          : '';
        return res.status(502).json({
          ok:false,
          error:`Selected Gold records could not all be mapped to exact source E071K TABKEYs. Deployment was NOT posted to the target.${details}`,
          diagnostics:{
            ...(sourceMeta.diagnostics||{}),
            sourceValueRows:sourceMeta.values?.length||0,
            selectedE071KRows:provenance.selectedK.length,
            selectedE071Headers:provenance.selectedHeaders.length,
            flattenedRows:provenance.sourceE071.length,
            unresolved:provenance.unresolved.slice(0,10)
          }
        });
      }

      sourceMeta.sourceE071=provenance.sourceE071;
      sourceMeta.recattr=provenance.recattr;
    }

    const targetDeployTableSet=DeployTableSet.map(t=>({
      ...t,
      DeployRowSet:(t.DeployRowSet||[]).map(r=>{
        const {
          RawTableKey: _rawTableKey,
          SourceRecnumber: _sourceRecnumber,
          SourceTableName: _sourceTableName,
          __provenanceSource: _provenanceSource,
          __targetTabKey: _targetTabKey,
          __sourceClient: _sourceClient,
          ...targetRow
        }=r;
        return targetRow;
      })
    }));

    const payload={
      BcsetId:goldBcsetName,
      BcsetText:bcsetText||`iConfigPro E2E - ${goldBcsetName}`,
      TargetCli:targetClient||process.env.SAP_DEPLOY_CLIENT||'',
      Trkorr:trkorr||'',
      Activate:activate===true||String(activate).toLowerCase()==='true'?'true':'false',
      DeployTableSet:targetDeployTableSet,
      SourceE071Json:JSON.stringify(sourceMeta.sourceE071||[]),
      SourceRecAttrJson:JSON.stringify(sourceMeta.recattr||[])
    };

    if(!sourceMeta.sourceE071?.length){
      return res.status(502).json({ok:false,error:`SourceE071Json is empty for ${bcsetId}; deployment was NOT posted to the target.`});
    }

    const result=await postDeploy(payload);

    let deploymentVersion=null;
    let deploymentHistoryAvailable=false;
    if(supabaseAdmin.configured()){
      try{
        const versionInfo=await supabaseAdmin.nextDeploymentVersion({projectId:String(projectId||'').trim()||null,bcsetId:historyBcsetId,targetClient:String(targetClient||'')});
        deploymentVersion=versionInfo.version;
        const savedDiff=latestDeployment?compareDeployments(latestDeployment.payload||{}, {DeployTableSet}):null;
        deploymentHistoryAvailable=true;
        const versionRow=await supabaseAdmin.createDeploymentVersion({
          project_id:String(projectId||'').trim()||null,
          bcset_id:historyBcsetId,
          target_client:String(targetClient||''),
          version:deploymentVersion,
          status:overwrite?'OVERWRITTEN':'DEPLOYED',
          payload_hash:hashDeployment({DeployTableSet}),
          payload:{DeployTableSet},
          record_count:Number(DeployTableSet.reduce((n,t)=>n+(t.DeployRowSet||[]).length,0)),
          value_count:Number(DeployTableSet.reduce((n,t)=>n+(t.DeployRowSet||[]).reduce((m,r)=>m+(r.DeployFieldSet||[]).length,0),0)),
          deployed_by:req.iconfigUser?.user_id||null,
          overwrite_of_version:overwrite?Number(versionInfo.latest?.version||0)||null:null,
          result:result||{},
          field_diff:savedDiff
        });
        try{await supabaseAdmin.writeAuditLog({
          projectId:String(projectId||'').trim()||null,userId:req.iconfigUser?.user_id,userEmail:req.iconfigUser?.user_email,displayName:req.iconfigUser?.display_name,
          action:overwrite?'GOLD_DEPLOYMENT_OVERWRITTEN':'GOLD_DEPLOYMENT_DEPLOYED',entityType:'GOLD_DEPLOYMENT',
          entityId:versionRow?.id||null,entityName:`${historyBcsetId} v${deploymentVersion}`,
          details:{version:deploymentVersion,targetClient,activate:Boolean(activate),overwrite:Boolean(overwrite),recordCount:versionRow?.record_count,valueCount:versionRow?.value_count}
        });}catch(auditErr){console.warn('[audit] deployment log failed:',auditErr.message);}
      }catch(historyErr){
        console.warn('[deployment-history] could not persist deployment version:',historyErr.message);
      }
    }
    res.json({ok:true,result,deploymentVersion,deploymentHistoryAvailable,overwrite:Boolean(overwrite)});
  }catch(e){
    console.error('[deploy] failed:',e.stack||e.message);
    res.status(502).json({ok:false,error:e.message});
  }
});

app.listen(PORT,()=>{ const host=process.env.SUPABASE_URL?new URL(process.env.SUPABASE_URL).host:'not-configured'; console.log(`iConfigPro E2E running at http://localhost:${PORT} | source=${mode} target=${targetMode} | auth=${auth.enabled?'xsuaa':'local-none'} | supabase=${host} | env=${fs.existsSync(envFile)?envFile:'not-found'}`); });
