const test=require('node:test');
const assert=require('node:assert/strict');
const {selectSourceProvenance}=require('../server/provenance');

test('existing source row falls back to preserved E071K TABKEY when final Silver omits DDIC key fields',()=>{
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_FAGL_SEGM',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'FAGL_SEGM',ObjFunc:'K',TabKey:'200ABC123',Activity:'',MasterType:'VDAT',MasterName:'V_FAGL_SEGM',ViewName:'V_FAGL_SEGM',SourceE071Seq:'1',SourcePhysicalTable:'FAGL_SEGM'}],
    values:[],recattr:[]
  };
  const out=selectSourceProvenance({
    deployTableSet:[{Tablename:'FAGL_SEGM',DeployRowSet:[{Recnumber:'1',SourceRecnumber:'1',RawTableKey:'',DeployFieldSet:[{Name:'NONKEY',Value:'X'}]}]}],
    sourceMeta,sourceClient:'200',targetClient:'500'
  });
  assert.equal(out.unresolved.length,0);
  assert.deepEqual(out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey),['500ABC123']);
  assert.equal(out.rowPlans[0].r.__provenanceSource,'source-tabkey-fallback');
});

test('runtime SAP DDIC key metadata overrides incomplete static metadata for Gold TABKEY derivation',()=>{
  const sourceMeta={
    e071:[{Seq:'1',Pgmid:'R3TR',Object:'VDAT',ObjName:'V_TASSIGN_MM_EKORG',ObjFunc:'K',Activity:'SIMG_CFMENU'}],
    e071k:[{Seq:'10',Pgmid:'R3TR',Object:'TABU',ObjName:'TASSIGN_MM_EKORG',ObjFunc:'K',TabKey:'2001000A',Activity:'',MasterType:'VDAT',MasterName:'V_TASSIGN_MM_EKORG',ViewName:'V_TASSIGN_MM_EKORG',SourceE071Seq:'1',SourcePhysicalTable:'TASSIGN_MM_EKORG'}],
    values:[],recattr:[]
  };
  const out=selectSourceProvenance({
    deployTableSet:[{Tablename:'TASSIGN_MM_EKORG',DeployRowSet:[{Recnumber:'1',SourceRecnumber:'1',RawTableKey:'',DeployFieldSet:[{Name:'BUKRS',Value:'9000'},{Name:'EKORG',Value:'A'}]}]}],
    sourceMeta,sourceClient:'200',targetClient:'500',
    ddicKeyFieldsByTable:{TASSIGN_MM_EKORG:['BUKRS','EKORG']}
  });
  assert.equal(out.unresolved.length,0);
  assert.deepEqual(out.sourceE071.filter(x=>x.TabKey).map(x=>x.TabKey),['5009000A']);
  assert.equal(out.rowPlans[0].r.__provenanceSource,'silver-values');
});
