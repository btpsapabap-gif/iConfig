const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const tree=fs.readFileSync(path.join(__dirname,'..','server','routes','tree.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'..','server','supabaseAdmin.js'),'utf8');
const modules=fs.readFileSync(path.join(__dirname,'..','server','sproModules.js'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','supabase','v77_module_code_hierarchy.sql'),'utf8');

for(const code of ['ER','FI','CO','LG','SD','MM','LE','QM','PD','PP','PS','TM','PY','PM']){
  test(`canonical module code ${code} exists in frontend catalog`,()=>assert.match(app,new RegExp(`id:'${code}'`)));
}

test('project L1-L6 requests use module code instead of display-name joins',()=>{
  assert.match(app,/moduleCode=\$\{encodeURIComponent\(requestedCode\)\}/);
  assert.match(app,/String\(n\.module_code\|\|''\)/);
  assert.doesNotMatch(app,/wanted=showAllAssigned\s*\? names/);
});

test('server supports canonical module-code hierarchy lookup and SAP legacy aliases',()=>{
  assert.match(tree,/moduleCode \|\| req\.query\.module \|\| req\.query\.moduleName/);
  assert.match(tree,/hierarchyAliasesFor\(moduleCode\)/);
  assert.match(admin,/module_code=eq\./);
  assert.match(modules,/\['FINANCIAL ACCOUNTING', 'FI'\]/);
  assert.match(modules,/\['WAREHOUSE \/ LOGISTICS EXECUTION', 'LE'\]/);
  assert.match(modules,/\['PRODUCTION PLANNING', 'PP'\]/);
});

test('hierarchy cache has canonical module_code migration',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS module_code VARCHAR\(10\)/);
  assert.match(sql,/WHEN 'FINANCIAL ACCOUNTING' THEN 'FI'/);
  assert.match(sql,/WHEN 'WAREHOUSE \/ LOGISTICS EXECUTION' THEN 'LE'/);
  assert.match(sql,/WHEN 'PRODUCTION PLANNING' THEN 'PP'/);
  assert.match(sql,/CREATE INDEX IF NOT EXISTS ix_spro_l1_l6_module_code/);
});

test('hierarchy endpoint does not convert missing canonical cache columns into a 502',()=>{
  assert.match(admin,/try\{\n\s*const byCode=/);
  assert.match(admin,/hierarchy_complete=eq\.true/);
  assert.match(admin,/if\(sourceSystem==='ODATA-BRANCH'\) return false/);
});

test('hierarchy endpoint uses Supabase first and OData only when cache is empty',()=>{
  const cache=tree.indexOf('const cached=await supabaseAdmin.listSproHierarchy(moduleCode,language);');
  const odata=tree.indexOf('rows=await fetchSproHierarchy(candidate,language);');
  assert.ok(cache>=0 && odata>cache);
  assert.match(tree,/If there are zero rows, call SAP OData/);
  assert.match(tree,/Static JSON is never a runtime hierarchy source/);
});

test('incomplete Supabase hierarchy is treated as an integrity error, not as a cache miss',()=>{
  assert.match(tree,/Supabase contains \${cached.length} L1-L6 row\(s\)/);
  assert.doesNotMatch(tree,/STATIC-FALLBACK-INCOMPLETE-ODATA/);
});
