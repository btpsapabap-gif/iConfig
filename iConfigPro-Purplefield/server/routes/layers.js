const express=require('express');
const {nodeIndex}=require('./tree');
const {fetchBcSetValues,fetchSourceDeployMetadata,isConfigured,mode}=require('../sapClient');
const router=express.Router();
const fs=require('fs');
const path=require('path');
let TABLE_META=[]; try{TABLE_META=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','tableMetadata.json'),'utf8'));}catch{}
const META=new Map(TABLE_META.map(x=>[String(x.table).toUpperCase(),x]));
const TECHNICAL=new Set(['MANDT','CLIENT']);
// This package targets the reported target DDIC, where T001K-WERKS is absent.
// Set SAP_TARGET_DDIC_EXCLUDED_FIELDS to a comma-separated list of
// TABLE.FIELD entries to replace/extend this compatibility profile.
const TARGET_DDIC_EXCLUDED=new Set(String(process.env.SAP_TARGET_DDIC_EXCLUDED_FIELDS||'T001K.WERKS').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean));
const keyFields=tbl=>String(META.get(String(tbl).toUpperCase())?.key||'').split(',').map(x=>x.trim().toUpperCase()).filter(x=>x&&x!=='MANDT'&&x!=='SPRAS');
const targetExclusion=(tbl,field)=>TARGET_DDIC_EXCLUDED.has(`${String(tbl).trim().toUpperCase()}.${String(field).trim().toUpperCase()}`);
const cleanFields=(tbl,fields)=>Object.fromEntries(Object.entries(fields||{}).filter(([k,v])=>{const u=String(k).toUpperCase();if(TECHNICAL.has(u)||targetExclusion(tbl,u))return false;if(v===''&&!keyFields(tbl).includes(u))return false;return true;}));
const PROPS={bcset:['BCSetID','BcsetId'],table:['TableName','TabName'],recnumber:['RecNumber','Recnumber'],fieldname:['FieldName','Fieldname'],value:['FieldValue','Value','FIELDVALUE','VALUE'],rawkey:['RawTableKey']};
function pick(r,c){if(!r)return '';const keys=Object.keys(r);const lower=new Map(keys.map(k=>[k.toLowerCase(),k]));for(const x of c){const k=lower.get(String(x).toLowerCase());if(k&&r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k];}return ''}
function tablesForNode(node){const s=new Set();(function walk(n){(n.tables||[]).forEach(t=>String(t).split(/\s*\/\s*/).map(x=>x.trim().toUpperCase()).filter(x=>/^T[A-Z0-9_]*$/.test(x)).forEach(x=>s.add(x)));(n.children||[]).forEach(walk)})(node);return s;}

// BCSetE071KSet is the authoritative relationship between the value owner
// exposed by BCSetValueSet and the physical customizing object. Do not infer
// a table by stripping V_/W_ prefixes: SAP already supplies OBJNAME plus
// MASTERNAME/VIEWNAME and SourceE071Seq.
function sourceTableCandidates(sourceTable){
  const raw=String(sourceTable||'').trim().toUpperCase();
  if(!raw)return [];
  const out=[raw];
  // SAP BC Set values can be owned by maintenance-view/object names such as
  // V_T001, V_T001_U, W_T024W_ASSIGN or VC_T001L while the process directory
  // is intentionally defined against the physical table (T001, T024W, T001L).
  // Metadata aliases remain authoritative; these candidates are only a
  // compatibility fallback for source services that return view/object names.
  const prefixes=['VC_','VDAT_','CDAT_','V_','W_'];
  for(const prefix of prefixes){
    if(raw.startsWith(prefix)){
      let base=raw.slice(prefix.length);
      out.push(base);
      while(base.includes('_')){
        base=base.slice(0,base.lastIndexOf('_'));
        if(base)out.push(base);
      }
    }
  }
  return [...new Set(out)];
}

function buildSourceTableAliases(e071kRows,tables,sourceRows=[]){
  const aliases=new Map();
  // First use the real E071/E071K relationship supplied by SAP.
  for(const k of e071kRows||[]){
    const physical=String(k.ObjName||'').trim().toUpperCase();
    if(!physical||!tables.has(physical))continue;

    const master=String(k.MasterName||'').trim().toUpperCase();
    const view=String(k.ViewName||'').trim().toUpperCase();

    aliases.set(physical,physical);
    if(master) aliases.set(master,physical);
    if(view) aliases.set(view,physical);
  }

  // Compatibility fallback: if source metadata is unavailable or SAP returns
  // a view/object name in TableName, resolve it to a configured physical
  // table. This restores the original Bronze matching behaviour without
  // changing Silver/Gold or the provenance data carried downstream.
  for(const row of sourceRows||[]){
    const raw=String(row||'').trim().toUpperCase();
    if(!raw||aliases.has(raw))continue;
    const match=sourceTableCandidates(raw).find(x=>tables.has(x));
    if(match)aliases.set(raw,match);
  }
  return aliases;
}

function group(rows,tables,aliases){
  // First assemble all field-level rows into the SAP record represented by
  // BCSetValueSet's TableName + RecNumber. Afterwards collapse repeated
  // physical rows by their configured DDIC key. Some BC Sets expose the same
  // T001K BWKEY under several source record numbers. Keep the FIRST source
  // record as the provenance anchor, but never merge values from later copies:
  // that was how a stray field such as T001K-WERKS could leak into the row.
  const bySourceRecord=new Map();
  rows.forEach(r=>{
    const sourceTable=String(pick(r,PROPS.table)).trim().toUpperCase();
    const table=aliases.get(sourceTable)||sourceTable;
    if(!tables.has(table))return;
    const rec=String(pick(r,PROPS.recnumber)).replace(/\u00a0/g,' ').trim();
    const k=`${table}#${rec}`;
    if(!bySourceRecord.has(k))bySourceRecord.set(k,{
      table,
      recnumber:rec,
      rawTableKey:pick(r,PROPS.rawkey),
      sourceRecnumber:rec,
      viewname:sourceTable,
      sourceTableName:sourceTable,
      fields:{},
      sourceRecnumbers:[rec]
    });
    const f=String(pick(r,PROPS.fieldname)).trim().toUpperCase();
    if(f && !Object.prototype.hasOwnProperty.call(bySourceRecord.get(k).fields,f)){
      bySourceRecord.get(k).fields[f]=pick(r,PROPS.value);
    }
  });

  const out=[];
  const canonicalByIdentity=new Map();
  for(const r of bySourceRecord.values()){
    const keyNames=keyFields(r.table);
    const hasFullKey=keyNames.length&&keyNames.every(f=>Object.prototype.hasOwnProperty.call(r.fields,f));
    const identityParts=hasFullKey
      ? keyNames.map(f=>`${f}=${normalizeIdentityValue(r.fields[f])}`)
      : Object.keys(r.fields).sort().map(f=>`${f}=${normalizeIdentityValue(r.fields[f])}`);
    const identity=`${r.table}#${identityParts.join('|')}`;
    const canonical=canonicalByIdentity.get(identity);
    if(canonical){
      canonical.sourceRecnumbers.push(r.sourceRecnumber);
      continue;
    }
    canonicalByIdentity.set(identity,r);
    out.push(r);
  }
  return out;
}

function normalizeIdentityValue(value){
  if(value===null||value===undefined)return '';
  return String(value).replace(/\u00a0/g,' ').trim().toUpperCase();
}

function validateAndTransform(records){
  const fieldUnion={};
  for(const r of records){
    const table=String(r?.table||'').trim().toUpperCase();
    fieldUnion[table] ||= new Set();
    Object.keys(r?.fields||{}).forEach(f=>{
      const field=String(f).trim().toUpperCase();
      if(field&&!targetExclusion(table,field))fieldUnion[table].add(field);
    });
  }

  const seen=new Set();
  const out=[];
  for(const original of records){
    const r=JSON.parse(JSON.stringify(original||{}));
    r.table=String(r.table||'').trim().toUpperCase();
    r.recnumber=String(r.recnumber||'').replace(/\u00a0/g,' ').trim();
    r.fields ||= {};
    const normalizedFields={};
    const excludedFields=[];
    for(const [name,value] of Object.entries(r.fields)){
      const field=String(name).trim().toUpperCase();
      if(!field)continue;
      if(targetExclusion(r.table,field)){
        excludedFields.push({field,reason:'FIELD_NOT_IN_TARGET_DDIC'});
        continue;
      }
      normalizedFields[field]=typeof value==='string'?value.trim():value;
    }
    r.fields=normalizedFields;

    const recordKey=r.table+'#'+r.recnumber;
    const duplicate=seen.has(recordKey);
    seen.add(recordKey);
    // T-table rows can be sparse because fields are conditionally maintained;
    // a table-wide union incorrectly flags those valid rows as incomplete.
    const missing=r.table.startsWith('T')?[]:[...(fieldUnion[r.table]||[])].filter(f=>!(f in r.fields));
    const errors=[];
    if(!r.table)errors.push('Table is required');
    if(!r.recnumber)errors.push('Rec# is required');
    if(duplicate)errors.push('Duplicate record key in selection');
    const warnings=[];
    if(missing.length)warnings.push(`Missing fields: ${missing.join(', ')}`);
    excludedFields.forEach(x=>warnings.push(`${x.field}: ${x.reason}`));
    out.push({...r,status:errors.length?'error':warnings.length?'warning':'validated',errors,missingFields:missing,excludedFields,warnings});
  }
  return out;
}
router.get('/bronze/:nodeId',async(req,res)=>{const knownNode=nodeIndex[req.params.nodeId];const requestedTables=String(req.query.tables||'').split(',').map(x=>String(x).trim().toUpperCase()).filter(t=>/^T[A-Z0-9_]*$/.test(t));const node=knownNode||{id:req.params.nodeId,name:String(req.query.nodeName||req.params.nodeId),tables:requestedTables,children:[]};if(!knownNode&&!requestedTables.length)return res.status(404).json({error:'Unknown node and no table scope supplied'});if(mode!=='mock'&&!isConfigured())return res.status(503).json({error:'SAP source not configured'});const id=String(req.query.bcset||process.env.SAP_BCSET_ID||'');if(!id)return res.status(400).json({error:'BC Set is required'});try{const rows=await fetchBcSetValues(id);const tables=tablesForNode(node);let sourceMeta={e071:[],e071k:[],sourceE071:[],recattr:[],available:false};if(mode==='sap'){try{sourceMeta=await fetchSourceDeployMetadata(id,[...tables]);}catch(metaErr){console.warn('[bronze] source E071/E071K metadata unavailable:',metaErr.message);}}const sourceTables=[...new Set(rows.map(r=>String(pick(r,PROPS.table)).trim().toUpperCase()).filter(Boolean))];const aliases=buildSourceTableAliases(sourceMeta.e071k,tables,sourceTables);const records=group(rows,tables,aliases);const returnedTables=[...new Set(rows.map(r=>{const raw=String(pick(r,PROPS.table)).trim().toUpperCase();return aliases.get(raw)||raw;}).filter(t=>tables.has(t)))];const matchedSourceTables=[...new Set(records.map(r=>r.sourceTableName).filter(Boolean))];res.json({layer:'bronze',node:{id:node.id,name:node.name},bcsetId:id,tables:[...tables],recordCount:records.length,records,sourceMode:mode,sourceRowCount:rows.length,returnedTables,matchedSourceTables,tableAliases:Object.fromEntries([...aliases.entries()].filter(([raw,physical])=>raw!==physical)),diagnostics:{bcsetProperty:pick(rows[0],PROPS.bcset),tableProperty:pick(rows[0],PROPS.table),recordProperty:pick(rows[0],PROPS.recnumber),fieldProperty:pick(rows[0],PROPS.fieldname),valueProperty:pick(rows[0],PROPS.value),sourceE071Rows:sourceMeta.e071?.length||0,sourceE071KRows:sourceMeta.e071k?.length||0,sourceE071FlattenedRows:sourceMeta.sourceE071?.length||0,sourceMetadataAvailable:Boolean(sourceMeta.available),aliasCount:Object.keys(Object.fromEntries([...aliases.entries()].filter(([raw,physical])=>raw!==physical))).length}});}catch(e){res.status(502).json({error:e.message})}});
router.post('/silver',(req,res)=>{const records=req.body?.records;if(!Array.isArray(records)||!records.length)return res.status(400).json({error:'Select at least one Bronze record'});const validated=validateAndTransform(records);res.json({layer:'silver',recordCount:validated.length,validCount:validated.filter(r=>r.status==='validated').length,warningCount:validated.filter(r=>r.status==='warning').length,errorCount:validated.filter(r=>r.status==='error').length,records:validated});});
router.post('/gold',(req,res)=>{
  const records=req.body?.records;
  if(!Array.isArray(records)||!records.length)return res.status(400).json({error:'Promote at least one Silver record'});
  const client=String(req.body?.deployClient||process.env.SAP_DEPLOY_CLIENT||process.env.SAP_CLIENT||'');
  const bcsetId=String(req.body?.bcsetId||process.env.SAP_BCSET_ID||'');
  const bad=records.filter(r=>r.status==='error'||!r.table||!r.recnumber);
  if(bad.length)return res.status(422).json({error:`Cannot build Gold: ${bad.length} record(s) have validation errors`});
  const m=new Map();
  let valueCount=0;
  for(const r of records){
    const table=String(r.table||'').trim().toUpperCase();
    const fields=cleanFields(table,r.fields);
    if(!Object.keys(fields).length)return res.status(422).json({error:`Cannot build Gold: ${table} record ${r.recnumber} has no deployable fields after technical/blank-field cleanup.`});
    if(!m.has(table))m.set(table,{BcsetId:bcsetId,Tablename:table,Viewname:String(r.viewname||table).trim().toUpperCase()||table,DeployRowSet:[]});
    // Dense record numbering per table is intentional. SAP BC Set values and
    // SCPRRECA must use 1..n for the records actually being deployed.
    const rec=String(m.get(table).DeployRowSet.length+1);
    const row={BcsetId:bcsetId,Tablename:table,Recnumber:rec,
      SourceRecnumber:String(r.sourceRecnumber||r.recnumber||'').trim(),
      SourceTableName:String(r.sourceTableName||r.viewname||table).trim().toUpperCase(),
      RawTableKey:String(r.rawTableKey||''),
      DeployFieldSet:[]};
    for(const [Name,Value] of Object.entries(fields)){
      row.DeployFieldSet.push({BcsetId:bcsetId,Tablename:table,Recnumber:rec,Name,Value:String(Value??'')});
      valueCount++;
    }
    m.get(table).DeployRowSet.push(row);
  }
  const tables=[...m.values()];
  res.json({layer:'gold',targetClient:client,bcsetId,recordCount:records.length,valueCount,DeployTableSet:tables,preflight:{technicalFieldsRemoved:['MANDT','CLIENT'],targetDdICExcludedFields:[...TARGET_DDIC_EXCLUDED],blankNonKeyFieldsRemoved:true,denseRecnumbers:true}});
});
module.exports=router;
module.exports.__test={group,validateAndTransform,buildSourceTableAliases,normalizeIdentityValue,cleanFields,targetExclusion};
