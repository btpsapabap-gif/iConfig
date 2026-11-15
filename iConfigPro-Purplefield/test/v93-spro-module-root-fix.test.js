const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const abap=fs.readFileSync(path.join(root,'ZCL_IM_SPRO_IMG_V71_SEQUENCE_FIX.abap'),'utf8');
const tree=fs.readFileSync(path.join(root,'server/routes/tree.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'server/supabaseAdmin.js'),'utf8');

function method(name){
  const start=abap.indexOf(`  METHOD ${name}.`);
  const end=abap.indexOf('  ENDMETHOD.',start);
  assert.ok(start>=0 && end>start,`${name} method not found`);
  return abap.slice(start,end);
}

test('SPRO module structure lookup is restricted to SAP IMG structures',()=>{
  const m=method('get_structure_id');
  assert.match(m,/FROM ttree AS tt/i);
  assert.match(m,/INNER JOIN ttreet AS tx/i);
  assert.match(m,/tt~type = 'IMG'/i);
  assert.match(m,/tx~spras = iv_language/i);
  assert.match(m,/tx~text_cap = lv_module_cap/i);
  assert.match(m,/TRANSLATE lv_module_cap TO UPPER CASE/i);
  assert.doesNotMatch(m,/SELECT SINGLE id\s+FROM ttreet\s+INTO rv_structure_id/i);
});

test('Module hierarchy does not extract and re-root Enterprise Structure branches',()=>{
  assert.doesNotMatch(tree,/function extractModuleBranchesFromEnterpriseTree/);
  assert.doesNotMatch(tree,/function isSparseDirectModuleTree/);
  assert.doesNotMatch(tree,/source='ODATA-BRANCH'/);
  assert.doesNotMatch(tree,/fetchSproHierarchy\('Enterprise Structure',language\)/);
});

test('Only canonical SAP-rooted module hierarchy is accepted from Supabase cache',()=>{
  assert.match(admin,/if\(sourceSystem==='ODATA-BRANCH'\) return false/);
  assert.match(admin,/if\(!isCanonicalSapRoot\(root\)\) return false/);
});
