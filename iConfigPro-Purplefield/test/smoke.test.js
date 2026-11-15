const test=require('node:test');const assert=require('node:assert/strict');
process.env.DATA_MODE='mock';process.env.TARGET_MODE='mock';
const {listBcSets,fetchBcSetValues,postDeploy}=require('../server/sapClient');
const {__test}=require('../server/routes/layers');
test('mock source exposes a BC set and rows',async()=>{const sets=await listBcSets();assert.equal(sets[0].id,'DEMO_E2E');const rows=await fetchBcSetValues('DEMO_E2E');assert.ok(rows.length>0)});
test('mock target accepts a Gold deployment',async()=>{const r=await postDeploy({BcsetId:'DEMO_E2E',TargetCli:'200',Activate:'false',DeployTableSet:[{BcsetId:'DEMO_E2E',Tablename:'T001',DeployRowSet:[]} ]});assert.equal(r.Status,'STAGED');assert.ok(r.DeploymentId)});

test('Bronze maps SAP maintenance-view names back to configured physical tables',()=>{
  const {buildSourceTableAliases}=require('../server/routes/layers').__test;
  const tables=new Set(['T001','T001K','T001L','T024W','TKA01']);
  const aliases=buildSourceTableAliases([],tables,['V_T001','V_T001_U','V_T001K_ASSIGN','VC_T001L','W_T024W_ASSIGN','V_TKA01_GD']);
  assert.equal(aliases.get('V_T001'),'T001');
  assert.equal(aliases.get('V_T001_U'),'T001');
  assert.equal(aliases.get('V_T001K_ASSIGN'),'T001K');
  assert.equal(aliases.get('VC_T001L'),'T001L');
  assert.equal(aliases.get('W_T024W_ASSIGN'),'T024W');
  assert.equal(aliases.get('V_TKA01_GD'),'TKA01');
});

test('Bronze value rows are deduplicated by BCSet + table + record + field',()=>{
  const {dedupeValueRows}=require('../server/sapClient');
  const rows=[
    {BCSetID:'ZS2P_FICO_001',TableName:'T001L',RecNumber:' 1 ',FieldName:'LGORT',FieldValue:'1010'},
    {BCSetID:'ZS2P_FICO_001',TableName:'T001L',RecNumber:'\u00a01\u00a0',FieldName:'LGORT',FieldValue:'1010'},
    {BCSetID:'ZS2P_FICO_001',TableName:'T001L',RecNumber:'1',FieldName:'WERKS',FieldValue:'1100'}
  ];
  const r=dedupeValueRows(rows);
  assert.equal(r.rows.length,2);
  assert.equal(r.duplicateCount,1);
});

test('target ABAP uses standard transport insertion and selected-content verification',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','sap-reference','target','ZIM_DEPLOY_2_ZCL_IM_BCSET_DEPLOY.abap'),'utf8');
  assert.match(p,/with_transp_insert\s*=\s*'X'/);
  assert.match(p,/selected content verification failed/);
  assert.doesNotMatch(p,/IF lv_bcset_recs <> lines\( lt_recattr \) OR lv_bcset_vals <> lines\( lt_vals \)/);
});


test('Bronze collapses duplicate SAP records by physical table business key, not Rec#',()=>{
  const rows=[
    {TableName:'T001L',RecNumber:'1',FieldName:'WERKS',FieldValue:'1100'},
    {TableName:'T001L',RecNumber:'1',FieldName:'LGORT',FieldValue:'1010'},
    {TableName:'T001L',RecNumber:'3',FieldName:'WERKS',FieldValue:'1100'},
    {TableName:'T001L',RecNumber:'3',FieldName:'LGORT',FieldValue:'1010'},
    {TableName:'T001L',RecNumber:'2',FieldName:'WERKS',FieldValue:'1100'},
    {TableName:'T001L',RecNumber:'2',FieldName:'LGORT',FieldValue:'1011'}
  ];
  const out=__test.group(rows,new Set(['T001L']),new Map());
  assert.equal(out.length,2);
  assert.deepEqual(out.map(r=>[r.fields.WERKS,r.fields.LGORT]),[['1100','1010'],['1100','1011']]);
});

test('target staging does not reject a missing explicit SCP1 row',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','sap-reference','target','ZIM_DEPLOY_2_ZCL_IM_BCSET_DEPLOY.abap'),'utf8');
  assert.doesNotMatch(p,/was not registered as R3TR SCP1 in task/);
  assert.match(p,/absence of an SCP1/);
  assert.match(p,/with_transp_insert\s*=\s*'X'/);
});

test('Bronze keeps blank-but-present physical key fields and deduplicates by the complete key',()=>{
  const rows=[
    {TableName:'TKA02',RecNumber:'1',FieldName:'BUKRS',FieldValue:'1000'},
    {TableName:'TKA02',RecNumber:'1',FieldName:'GSBER',FieldValue:''},
    {TableName:'TKA02',RecNumber:'2',FieldName:'BUKRS',FieldValue:'1000'},
    {TableName:'TKA02',RecNumber:'2',FieldName:'GSBER',FieldValue:''}
  ];
  const out=__test.group(rows,new Set(['TKA02']),new Map());
  assert.equal(out.length,1);
  assert.equal(out[0].fields.BUKRS,'1000');
  assert.equal(out[0].fields.GSBER,'');
});

test('Gold cleanup retains blank physical key fields while removing blank non-key fields',()=>{
  const {cleanFields}=require('../server/routes/layers').__test;
  const fields={BUKRS:'1000',GSBER:'',MANDT:'200',DESCRIPTION:''};
  const out=cleanFields('TKA02',fields);
  assert.equal(out.BUKRS,'1000');
  assert.equal(out.GSBER,'');
  assert.equal(out.MANDT,undefined);
  assert.equal(out.DESCRIPTION,undefined);
});

test('deployment modal has an explicit Stage and activate checkbox',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(require('node:path').join(__dirname,'..','public','app.js'),'utf8');
  assert.match(p,/id="deployActivate"/);
  assert.match(p,/Stage and activate/);
  assert.match(js,/activate=!!\$\\('deployActivate'\\)/);
});

test('deployment source provenance is fail-closed when source metadata is unavailable',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','server','index.js'),'utf8');
  assert.match(p,/Source E071\/E071K provenance is unavailable/);
  assert.match(p,/payload\.SourceE071Json=JSON\.stringify/);
});

test('source metadata reader has an unfiltered fallback instead of silently returning empty metadata on HTTP 400',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','server','sapClient.js'),'utf8');
  const start=p.indexOf('async function fetchSourceEntityRows(');
  const end=p.indexOf('async function fetchSourceDeployMetadata(',start);
  const body=p.slice(start,end);
  assert.match(body,/Compatibility path/);
  assert.match(body,/Read the entity set without \$filter/);
  assert.match(body,/return rows\.filter/);
  assert.doesNotMatch(body,/if\(r\.status===404 \|\| r\.status===400\) return \[\]/);
});

test('TKA02 blank key component is accepted for exact source TABKEY derivation',()=>{
  const p=require('../server/provenance');
  const candidates=p.deriveFromFieldMap('TKA02',new Map([['BUKRS','1000'],['GSBER','']]),'200');
  assert.ok(candidates.includes('2001000'));
});

test('source metadata reader falls back when filtered OData returns HTTP 200 with zero rows',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','server','sapClient.js'),'utf8');
  const start=p.indexOf('async function fetchSourceEntityRows(');
  const end=p.indexOf('async function fetchSourceDeployMetadata(',start);
  const body=p.slice(start,end);
  assert.match(body,/filtered read returned HTTP 200 with 0 rows/);
  assert.match(body,/using unfiltered compatibility read/);
});

test('Bronze preserves original SourceRecnumber for downstream provenance',()=>{
  const p=require('../server/routes/layers');
  const out=p.__test.group([
    {BCSetID:'ZS2P_FICO_001',TableName:'TKA02',RecNumber:'1',FieldName:'BUKRS',FieldValue:'1000'}
  ],new Set(['TKA02']),new Map([['TKA02','TKA02']]));
  assert.equal(out[0].sourceRecnumber,'1');
});

test('incomplete static DDIC key metadata uses full field identity instead of BC RecNumber',()=>{
  const p=require('../server/routes/layers');
  const rows=[
    {table:'TKA02',recnumber:'1',fields:{BUKRS:'1000'}},
    {table:'TKA02',recnumber:'2',fields:{BUKRS:'1000'}}
  ];
  const out=p.__test.group(rows,new Set(['TKA02']),new Map());
  assert.equal(out.length,1);
});

test('Gold carries SourceRecnumber internally for provenance',()=>{
  const fs=require('fs');
  const p=fs.readFileSync(require('node:path').join(__dirname,'..','server','routes','layers.js'),'utf8');
  assert.match(p,/SourceRecnumber:String\(r\.sourceRecnumber/);
});

test('Gold deployment derives target-client TABKEYs from final Silver values, not source E071K values',()=>{
  const {selectSourceProvenance}=require('../server/provenance');
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_T001',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'T001',ObjFunc:'K',TabKey:'2001000',Activity:'',MasterType:'VDAT',MasterName:'V_T001',ViewName:'V_T001',SourceE071Seq:'1'}],
    values:[
      {TableName:'T001',RecNumber:'1',FieldName:'BUKRS',FieldValue:'1000'},
      {TableName:'T001',RecNumber:'2',FieldName:'BUKRS',FieldValue:'9000'}
    ],
    recattr:[]
  };
  const deployTableSet=[{
    BcsetId:'ZS2P_FICO_001',Tablename:'T001',Viewname:'V_T001',DeployRowSet:[
      {BcsetId:'ZS2P_FICO_001',Tablename:'T001',Recnumber:'1',SourceRecnumber:'1',RawTableKey:'2001000',DeployFieldSet:[{Name:'BUKRS',Value:'1000'}]},
      {BcsetId:'ZS2P_FICO_001',Tablename:'T001',Recnumber:'2',SourceRecnumber:'2',RawTableKey:'',DeployFieldSet:[{Name:'BUKRS',Value:'9000'}]}
    ]
  }];
  const out=selectSourceProvenance({deployTableSet,sourceMeta,sourceClient:'200',targetClient:'500'});
  const keys=out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey);
  assert.deepEqual(keys,['5001000','5009000']);
  assert.ok(!keys.includes('2001000'));
  assert.equal(out.unresolved.length,0);
});

test('Silver-added T001 row gets a target TABKEY even when no source E071K row exists for that value',()=>{
  const {selectSourceProvenance}=require('../server/provenance');
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_T001',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'T001',ObjFunc:'K',TabKey:'2001000',MasterType:'VDAT',MasterName:'V_T001',ViewName:'V_T001',SourceE071Seq:'1'}],
    values:[],recattr:[]
  };
  const out=selectSourceProvenance({
    deployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'2',DeployFieldSet:[{Name:'BUKRS',Value:'9000'}]}]}],
    sourceMeta,sourceClient:'200',targetClient:'500'
  });
  assert.equal(out.unresolved.length,0);
  assert.deepEqual(out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey),['5009000']);
});

test('TKA07 uses the actual physical primary key KOKRS + VERSN + GJAHR, excluding technical MANDT',()=>{
  const p=require('../server/provenance');
  assert.deepEqual(p.tableKeyFields('TKA07'),['KOKRS','VERSN','GJAHR']);
  const candidates=p.deriveFromFieldMap('TKA07',new Map([['KOKRS','1000'],['VERSN','0'],['GJAHR','2026']]),'200');
  assert.ok(candidates.includes('200100002026'));
  const target=p.deriveFromFieldMap('TKA07',new Map([['KOKRS','1000'],['VERSN','0'],['GJAHR','2026']]),'500');
  assert.ok(target.includes('500100002026'));
});

test('TKA07 final Silver row maps to target TABKEY from final key fields',()=>{
  const {selectSourceProvenance}=require('../server/provenance');
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_TKA07',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'TKA07',ObjFunc:'K',TabKey:'200100002026',Activity:'',MasterType:'VDAT',MasterName:'V_TKA07',ViewName:'V_TKA07',SourceE071Seq:'1'}],
    values:[],recattr:[]
  };
  const out=selectSourceProvenance({
    deployTableSet:[{Tablename:'TKA07',DeployRowSet:[{Recnumber:'1',SourceRecnumber:'1',RawTableKey:'200100002026',DeployFieldSet:[
      {Name:'KOKRS',Value:'1000'},{Name:'VERSN',Value:'0'},{Name:'GJAHR',Value:'2026'},{Name:'ACUPD',Value:'00'}
    ]}]}],
    sourceMeta,sourceClient:'200',targetClient:'500'
  });
  assert.equal(out.unresolved.length,0);
  assert.deepEqual(out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey),['500100002026']);
});

test('TKA02 uses the actual physical primary key BUKRS + GSBER, not non-key KOKRS',()=>{
  const p=require('../server/provenance');
  assert.deepEqual(p.tableKeyFields('TKA02'),['BUKRS','GSBER']);
  const candidates=p.deriveFromFieldMap('TKA02',new Map([['BUKRS','1000'],['GSBER','']]),'200');
  assert.ok(candidates.includes('2001000'));
  const target=p.deriveFromFieldMap('TKA02',new Map([['BUKRS','1000'],['GSBER','']]),'500');
  assert.ok(target.includes('5001000'));
});

test('TKA02 final Silver row with BUKRS and blank GSBER maps to target TABKEY',()=>{
  const {selectSourceProvenance}=require('../server/provenance');
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_TKA02',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'TKA02',ObjFunc:'K',TabKey:'2001000',Activity:'',MasterType:'VDAT',MasterName:'V_TKA02',ViewName:'V_TKA02',SourceE071Seq:'1'}],
    values:[
      {TableName:'TKA02',RecNumber:'1',FieldName:'BUKRS',FieldValue:'1000'},
      {TableName:'TKA02',RecNumber:'1',FieldName:'GSBER',FieldValue:''},
      {TableName:'TKA02',RecNumber:'1',FieldName:'KOKRS',FieldValue:'1000'}
    ],recattr:[]
  };
  const out=selectSourceProvenance({
    deployTableSet:[{Tablename:'TKA02',DeployRowSet:[{Recnumber:'1',SourceRecnumber:'1',RawTableKey:'2001000',DeployFieldSet:[
      {Name:'BUKRS',Value:'1000'},{Name:'GSBER',Value:''},{Name:'KOKRS',Value:'1000'}
    ]}]}],
    sourceMeta,sourceClient:'200',targetClient:'500'
  });
  assert.equal(out.unresolved.length,0);
  assert.deepEqual(out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey),['5001000']);
});
