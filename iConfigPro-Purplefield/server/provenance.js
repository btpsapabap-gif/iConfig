const fs=require('fs');const path=require('path');
let TABLE_META=[];try{TABLE_META=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','tableMetadata.json'),'utf8'));}catch{}
const TABLE_KEYS=new Map(TABLE_META.map(x=>[String(x.table||'').trim().toUpperCase(),String(x.key||'').split(',').map(k=>k.trim().toUpperCase()).filter(k=>k&&k!=='SPRAS'&&k!=='MANDT')]));
function normalize(v){return String(v??'').replace(/\u00a0/g,' ').trim();}
function dedupeByKey(rows,keyFn){
  const out=[];
  const seen=new Set();
  for(const row of (rows||[])){
    const key=String(keyFn(row));
    if(seen.has(key))continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
function tableKeyFields(table){return TABLE_KEYS.get(String(table||'').trim().toUpperCase())||[];}
function deriveTabKeyCandidates(table,row,sourceClient){
  const fields=row?.DeployFieldSet||[];
  const values=new Map(fields.map(f=>[String(f.Name||'').trim().toUpperCase(),normalize(f.Value)]));
  return deriveFromFieldMap(table,values,sourceClient);
}
function deriveFromFieldMap(table,values,sourceClient){
  const keyFields=tableKeyFields(table);
  if(!keyFields.length)return [];
  const parts=keyFields.map(k=>values.get(k));
  // Blank is a valid SAP key value; only an absent key component is incomplete.
  if(parts.some(v=>v===undefined))return [];
  const joined=parts.join('');
  const client=normalize(sourceClient);
  const withClient=client?client+joined:joined;
  return [...new Set([withClient,joined])].filter(v=>v!=='');
}
function sourceValueTabKeyCandidates(table,sourceRecnumber,sourceValues,sourceClient,sourceTableAliases,e071kRows){
  const physical=normalize(table).toUpperCase();
  const rec=normalize(sourceRecnumber);
  if(!rec)return [];

  // A Gold row is normalized to the physical table name, while BCSetValueSet
  // can legitimately store the same source record under its maintenance view
  // (for example TKA02 -> V_TKA02). Build the complete set of source owner
  // names from E071K rather than requiring TableName = physical table.
  const sourceNames=new Set([physical]);
  for(const k of e071kRows||[]){
    const kPhysical=normalize(k.SourcePhysicalTable||k.ObjName).toUpperCase();
    if(kPhysical!==physical)continue;
    for(const name of [k.ObjName,k.MasterName,k.ViewName]){
      const n=normalize(name).toUpperCase();
      if(n)sourceNames.add(n);
    }
  }
  for(const [alias,mapped] of sourceTableAliases||new Map()){
    if(normalize(mapped).toUpperCase()===physical)sourceNames.add(normalize(alias).toUpperCase());
  }

  const valuesByField=new Map();
  for(const v of sourceValues||[]){
    const rawTable=normalize(v.TableName).toUpperCase();
    if(!sourceNames.has(rawTable))continue;
    if(normalize(v.RecNumber)!==rec)continue;
    const field=normalize(v.FieldName).toUpperCase();
    if(field)valuesByField.set(field,normalize(v.FieldValue));
  }
  return deriveFromFieldMap(physical,valuesByField,sourceClient);
}
function buildSourceTableAliases(e071kRows,tables){
  const aliases=new Map();
  for(const k of e071kRows||[]){
    const physical=normalize(k.SourcePhysicalTable||k.ObjName).toUpperCase();
    if(!physical|| (tables&&tables.size&&!tables.has(physical)))continue;
    const obj=normalize(k.ObjName).toUpperCase();
    const master=normalize(k.MasterName).toUpperCase();
    const view=normalize(k.ViewName).toUpperCase();
    aliases.set(physical,physical);
    if(obj)aliases.set(obj,physical);
    if(master)aliases.set(master,physical);
    if(view)aliases.set(view,physical);
  }
  return aliases;
}

function sourceRecordOrdinalTabKeyCandidates(table,sourceRecnumber,sourceMeta){
  const physical=normalize(table).toUpperCase();
  const rec=Number.parseInt(normalize(sourceRecnumber),10);
  if(!Number.isFinite(rec)||rec<1)return [];
  const parents=(sourceMeta.e071k||[]).filter(k=>normalize(k.SourcePhysicalTable||k.ObjName).toUpperCase()===physical);
  if(!parents.length)return [];
  const groups=new Map();
  for(const k of parents){
    const parent=normalize(k.SourceE071Seq);
    if(!groups.has(parent))groups.set(parent,[]);
    groups.get(parent).push(k);
  }
  const candidates=[];
  for(const rows of groups.values()){
    rows.sort((a,b)=>Number.parseInt(normalize(a.Seq),10)-Number.parseInt(normalize(b.Seq),10));
    const row=rows[rec-1];
    if(row?.TabKey) candidates.push(normalize(row.TabKey));
  }
  return [...new Set(candidates)].filter(Boolean);
}


function inferSourceRecnumber(table,row,sourceValues,e071kRows){
  const physical=normalize(table).toUpperCase();
  const sourceNames=new Set([physical]);
  for(const k of e071kRows||[]){
    if(normalize(k.SourcePhysicalTable||k.ObjName).toUpperCase()!==physical)continue;
    for(const name of [k.ObjName,k.MasterName,k.ViewName]){
      const n=normalize(name).toUpperCase(); if(n)sourceNames.add(n);
    }
  }

  const goldFields=new Map((row.DeployFieldSet||[]).map(f=>[
    normalize(f.Name).toUpperCase(), normalize(f.Value)
  ]));
  if(!goldFields.size)return '';

  const grouped=new Map();
  for(const v of sourceValues||[]){
    if(!sourceNames.has(normalize(v.TableName).toUpperCase()))continue;
    const rec=normalize(v.RecNumber);
    if(!rec)continue;
    if(!grouped.has(rec))grouped.set(rec,new Map());
    const field=normalize(v.FieldName).toUpperCase();
    if(field)grouped.get(rec).set(field,normalize(v.FieldValue));
  }

  const matches=[];
  for(const [rec,vals] of grouped){
    let all=true;
    for(const [field,value] of goldFields){
      if(!vals.has(field) || vals.get(field)!==value){all=false;break;}
    }
    if(all)matches.push(rec);
  }
  return matches.length===1?matches[0]:'';
}

function deriveTargetTabKey(table,row,targetClient,keyFieldsOverride){
  const fields=row?.DeployFieldSet||[];
  const values=new Map(fields.map(f=>[
    String(f.Name||'').trim().toUpperCase(),
    normalize(f.Value)
  ]));
  const keyFields=Array.isArray(keyFieldsOverride)?keyFieldsOverride:tableKeyFields(table);
  if(!keyFields.length){
    const raw=normalize(row?.RawTableKey);
    const source=normalize(row?.__sourceClient);
    const target=normalize(targetClient);
    if(raw){
      if(source && target && raw.startsWith(source))return target+raw.slice(source.length);
      return raw;
    }
    return '';
  }
  const parts=keyFields.map(k=>values.get(k));
  // Key fields may legitimately be blank; only a missing component makes the
  // target TABKEY impossible to derive. The target client belongs in the
  // transport key, not in the Silver business-field values.
  if(parts.some(v=>v===undefined))return '';
  const joined=parts.join('');
  const client=normalize(targetClient);
  if(!client)return joined;
  return client+joined;
}

function selectSourceProvenance({deployTableSet,sourceMeta,sourceClient,targetClient,ddicKeyFieldsByTable}){
  const selectedKeys=new Map();
  const unresolved=[];
  const aliases=buildSourceTableAliases(sourceMeta.e071k||[]);
  const sourceRowsByTable=new Map();
  const sourceRowsByRawKey=new Map();

  for(const k of sourceMeta.e071k||[]){
    const table=normalize(k.SourcePhysicalTable||k.ObjName).toUpperCase();
    if(!table)continue;
    if(!sourceRowsByTable.has(table))sourceRowsByTable.set(table,[]);
    sourceRowsByTable.get(table).push(k);
    const raw=normalize(k.TabKey);
    if(raw)sourceRowsByRawKey.set(`${table}#${raw}`,k);
  }

  // Keep source provenance for identifying the correct E071 parent and
  // transport metadata. Prefer rebuilding the target TABKEY from FINAL Silver
  // values when complete DDIC key fields are available. For an existing source
  // row whose final Silver representation is missing key fields, the original
  // E071K TABKEY remains the authoritative fallback and is client-translated.
  const rowPlans=[];
  for(const t of deployTableSet||[]){
    const table=normalize(t.Tablename).toUpperCase();
    if(!table)continue;

    for(const r of (t.DeployRowSet||[])){
      const raw=normalize(r.RawTableKey);
      let sourceRec=normalize(r.SourceRecnumber);
      if(!sourceRec)sourceRec=inferSourceRecnumber(table,r,sourceMeta.values||[],sourceMeta.e071k||[]);
      if(sourceRec)r.SourceRecnumber=sourceRec;

      // First try the exact Bronze/source transport key. This identifies the
      // original E071K row even when Silver changed a non-key field.
      let template=raw?sourceRowsByRawKey.get(`${table}#${raw}`):undefined;

      // If RawTableKey is unavailable, use the original source record/key
      // matching logic strictly for provenance-template selection.
      if(!template && sourceRec){
        const sourceCandidates=new Set([
          ...sourceValueTabKeyCandidates(table,sourceRec,sourceMeta.values||[],sourceClient,aliases,sourceMeta.e071k||[]),
          ...sourceRecordOrdinalTabKeyCandidates(table,sourceRec,sourceMeta)
        ]);
        for(const candidate of sourceCandidates){
          template=sourceRowsByRawKey.get(`${table}#${normalize(candidate)}`);
          if(template)break;
        }
      }

      // A Silver-added record has no source record. Use a source E071K row for
      // the same physical table as the metadata template; its TABKEY is NOT
      // copied.
      if(!template){
        const rows=sourceRowsByTable.get(table)||[];
        template=rows[0];
      }

      // Some BC Set objects do not expose an E071K child for every physical
      // table in the source metadata service.  Do not let that make a valid
      // Gold table undeployable.  The target CTS registration path already
      // uses the physical DDIC table as R3TR TABU <table>; create a minimal
      // provenance template for that physical table only when no source
      // template exists.  This is deliberately NOT a source TABKEY copy: the
      // target TABKEY is rebuilt from the final Silver values below.
      if(!template){
        template={
          Seq:`FALLBACK#${table}`,
          SourceE071Seq:`FALLBACK#${table}`,
          Pgmid:'R3TR',
          Object:'TABU',
          ObjName:table,
          ObjFunc:'K',
          TabKey:'',
          Activity:'',
          MasterType:'TABU',
          MasterName:table,
          ViewName:'',
          SourcePhysicalTable:table,
          __physicalFallback:true
        };
      }

      r.__sourceClient=sourceClient;
      const runtimeKeyFields=Array.isArray(ddicKeyFieldsByTable?.[table])
        ? ddicKeyFieldsByTable[table]
        : (ddicKeyFieldsByTable instanceof Map ? ddicKeyFieldsByTable.get(table) : undefined);
      let targetTabKey=deriveTargetTabKey(table,r,targetClient,runtimeKeyFields);

      // Existing Bronze/Silver rows have an authoritative source E071K TABKEY.
      // If the final Silver row does not carry every DDIC key field, do not
      // discard that source record merely because the static tableMetadata.json
      // is incomplete. Preserve the source key and translate only the client
      // portion when source/target clients are known. A genuinely new Silver
      // row has no sourceRecnumber/template and therefore still fails closed.
      if(!targetTabKey && sourceRec && normalize(template?.TabKey)){
        const sourceTabKey=normalize(template.TabKey);
        const source=normalize(sourceClient);
        const target=normalize(targetClient);
        targetTabKey=(source && target && sourceTabKey.startsWith(source))
          ? target+sourceTabKey.slice(source.length)
          : sourceTabKey;
        r.__provenanceSource='source-tabkey-fallback';
      }

      if(!targetTabKey){
        unresolved.push({
          table,
          recnumber:normalize(r.Recnumber),
          sourceRecnumber:normalize(r.SourceRecnumber),
          reason:'Final Silver row does not contain all DDIC key fields required to derive the target E071K TABKEY'
        });
        continue;
      }
      if(!template){
        unresolved.push({
          table,
          recnumber:normalize(r.Recnumber),
          sourceRecnumber:normalize(r.SourceRecnumber),
          reason:'No source E071K metadata template exists for this physical table'
        });
        continue;
      }

      if(!selectedKeys.has(table))selectedKeys.set(table,[]);
      const keyId=`${normalize(template.SourceE071Seq)}#${targetTabKey}`;
      if(!selectedKeys.get(table).some(x=>x.id===keyId)){
        selectedKeys.get(table).push({id:keyId,template,targetTabKey});
      }
      if(!r.__provenanceSource) r.__provenanceSource=raw?'source-template':'silver-values';
      r.__targetTabKey=targetTabKey;
      rowPlans.push({table,r,template,targetTabKey});
    }
  }

  // The loop above is keyed by table for selection, so emit any target rows
  // whose table has multiple headers without relying on a synthetic table
  // lookup. This second pass also guarantees deterministic ordering.
  const rebuilt=[];
  const headerSeen=new Set();
  for(const plan of rowPlans){
    let h=plan.template&& (sourceMeta.e071||[]).find(x=>normalize(x.Seq)===normalize(plan.template.SourceE071Seq));
    if(!h && plan.template?.__physicalFallback){
      h={
        Seq:plan.template.SourceE071Seq,
        Pgmid:'R3TR',
        Object:'TABU',
        ObjName:plan.table,
        ObjFunc:'K',
        TabKey:'',
        Activity:'',
        MasterType:'',
        MasterName:'',
        ViewName:''
      };
    }
    if(!h)continue;
    const seq=normalize(h.Seq);
    if(!headerSeen.has(seq)){
      headerSeen.add(seq);
      rebuilt.push({Pgmid:h.Pgmid,Object:h.Object,ObjName:h.ObjName,ObjFunc:h.ObjFunc,TabKey:'',Activity:h.Activity,MasterType:'',MasterName:'',ViewName:''});
    }
    const childId=`${seq}#${plan.targetTabKey}`;
    if(!rebuilt.some(x=>x.TabKey===plan.targetTabKey && normalize(x.Pgmid)===normalize(plan.template.Pgmid) && normalize(x.MasterName)===normalize(plan.template.MasterName))){
      const k=plan.template;
      rebuilt.push({Pgmid:k.Pgmid,Object:k.Object,ObjName:k.ObjName,ObjFunc:k.ObjFunc,TabKey:plan.targetTabKey,Activity:k.Activity,MasterType:k.MasterType,MasterName:k.MasterName,ViewName:k.ViewName});
    }
  }

  // Build deployment RECATTR metadata for every selected Gold row.  The
  // target worker looks up this metadata by PHYSICAL TABLENAME + ORIGINAL
  // SOURCE RECNUMBER.  Do not depend on the source SCPRRECA service having
  // returned a row under exactly that physical name: older source BC Set
  // services can identify the same record by its maintenance-view/object
  // name.  E071/E071K is authoritative transport provenance, so use it as
  // the deterministic fallback for ObjectName/ObjectType/IMG Activity.
  const sourceRecattrByKey=new Map((sourceMeta.recattr||[]).map(a=>[
    `${normalize(a.Tablename).toUpperCase()}#${normalize(a.Recnumber)}`,a
  ]));
  const recattr=[];

  function headerForTemplate(template){
    if(!template)return null;
    const seq=normalize(template.SourceE071Seq);
    let h=seq
      ? (sourceMeta.e071||[]).find(x=>normalize(x.Seq)===seq)
      : null;
    if(h)return h;
    const names=new Set([template.ObjName,template.MasterName,template.ViewName]
      .map(x=>normalize(x).toUpperCase()).filter(Boolean));
    return (sourceMeta.e071||[]).find(x=>names.has(normalize(x.ObjName).toUpperCase()))||null;
  }

  for(const plan of rowPlans){
    const sourceRec=normalize(plan.r.SourceRecnumber||plan.r.Recnumber);
    const physical=normalize(plan.table).toUpperCase();
    if(!physical||!sourceRec)continue;

    const existing=sourceRecattrByKey.get(`${physical}#${sourceRec}`)
      || (sourceMeta.recattr||[]).find(a=>
          normalize(a.Recnumber)===sourceRec &&
          normalize(a.SourcePhysicalTable||a.Tablename).toUpperCase()===physical);

    const h=headerForTemplate(plan.template);

    // Exact source SCPRRECA first.  E071 header metadata is the deterministic
    // fallback.  This is NOT fabricated metadata: both ObjectName/ObjectType
    // and Activity originate from the source transport objects returned for
    // this BC Set.
    let objectName=normalize(existing?.ObjectName);
    let objectType=normalize(existing?.ObjectType);
    let documentationObject=normalize(existing?.DocumentationObject);

    if(!objectName) objectName=normalize(plan.template?.ObjName)||normalize(h?.ObjName);
    if(!objectType) objectType=normalize(plan.template?.Object)||normalize(h?.Object);
    if(!documentationObject) documentationObject=normalize(h?.Activity)||normalize(plan.template?.Activity);

    // If the direct E071 parent has no activity, locate the corresponding
    // maintenance-view header.  For T001 this is typically R3TR/VDAT/V_T001,
    // while the keyed row itself is R3TR/TABU/T001.
    if(!documentationObject){
      const names=new Set([plan.template?.ObjName,plan.template?.MasterName,plan.template?.ViewName]
        .map(x=>normalize(x).toUpperCase()).filter(Boolean));
      const activityHeader=(sourceMeta.e071||[]).find(x=>
        names.has(normalize(x.ObjName).toUpperCase()) && normalize(x.Activity));
      documentationObject=normalize(activityHeader?.Activity);
      if(!objectName) objectName=normalize(activityHeader?.ObjName);
      if(!objectType) objectType=normalize(activityHeader?.Object);
    }

    // The target guard accepts either complete ObjectName/ObjectType or a
    // valid IMG Activity.  Always carry a row when one of those source facts
    // exists; never silently drop it because the source service used a view
    // name rather than the physical table name.
    if(plan.template?.__physicalFallback){
      objectName=objectName||physical;
      objectType=objectType||'TABU';
    }

    // Keep the deployment self-contained even when the source metadata
    // service does not expose SCPRRECA/E071 provenance for this physical
    // table. The target ABAP class deliberately has the same physical-table
    // fallback (R3TR TABU <table>). Supplying it here also keeps older target
    // class revisions from rejecting the request before reaching activation.
    if(!objectName && !objectType && !documentationObject){
      objectName=physical;
      objectType='TABU';
    } else {
      objectName=objectName||physical;
      objectType=objectType||'TABU';
    }

    recattr.push({
      Tablename:physical,
      SourceTabName:existing?.SourceTabName||existing?.Tablename||physical,
      SourcePhysicalTable:physical,
      Recnumber:sourceRec,
      ObjectName:objectName,
      ObjectType:objectType,
      DocumentationObject:documentationObject,
      Uncomplete:normalize(existing?.Uncomplete)
    });
  }

  // Preserve any valid source RECATTR rows not represented by the selected
  // Gold rows.  This keeps SourceRecAttrJson faithful without changing the
  // deployment selection.
  for(const a of sourceMeta.recattr||[]){
    const physical=normalize(a.SourcePhysicalTable||a.Tablename).toUpperCase();
    const key=`${physical}#${normalize(a.Recnumber)}`;
    if(!recattr.some(x=>`${normalize(x.Tablename).toUpperCase()}#${normalize(x.Recnumber)}`===key))recattr.push(a);
  }
  const recattrUnique=dedupeByKey(recattr,a=>`${normalize(a.Tablename).toUpperCase()}#${normalize(a.Recnumber)}`);
  const selectedK=rebuilt.filter(x=>x.TabKey).map(x=>({
    Seq:'',SourceE071Seq:'',Pgmid:x.Pgmid,Object:x.Object,ObjName:x.ObjName,
    ObjFunc:x.ObjFunc,TabKey:x.TabKey,Activity:x.Activity,MasterType:x.MasterType,
    MasterName:x.MasterName,ViewName:x.ViewName
  }));
  const matchedTables=[...new Set(rowPlans.map(x=>x.table))];

  return {selectedK,selectedHeaders:[...headerSeen].map(seq=>(sourceMeta.e071||[]).find(h=>normalize(h.Seq)===seq)).filter(Boolean),sourceE071:rebuilt,recattr,unresolved,matchedTables,rowPlans};
}


module.exports={normalize,tableKeyFields,deriveTabKeyCandidates,deriveFromFieldMap,sourceValueTabKeyCandidates,sourceRecordOrdinalTabKeyCandidates,buildSourceTableAliases,inferSourceRecnumber,selectSourceProvenance};
