const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const admin=fs.readFileSync(path.join(__dirname,'..','server','supabaseAdmin.js'),'utf8');
const tree=fs.readFileSync(path.join(__dirname,'..','server','routes','tree.js'),'utf8');

test('Each module hierarchy is sourced from its own SAP OData hierarchy',()=>{
  assert.doesNotMatch(tree,/extractModuleBranchesFromEnterpriseTree/);
  assert.doesNotMatch(tree,/fetchSproHierarchy\('Enterprise Structure',language\)/);
  assert.match(tree,/rows=await fetchSproHierarchy\(candidate,language\)/);
  assert.match(admin,/if\(!isCanonicalSapRoot\(root\)\) return false/);
});

test('Project L1-L6 aggregates every assigned module response',()=>{
  assert.match(app,/Promise\.allSettled\(unique\.map\(async m=>/);
  assert.match(app,/const trees=\[\]/);
  assert.match(app,/trees\.push\(\{/);
  assert.match(app,/module_code:String\(module\.code\|\|root\.module_code/);
  assert.match(app,/state\.sproTree=trees/);
});

test('Project L1-L6 no longer silently drops a failed assigned module',()=>{
  assert.match(app,/const failures=\[\]/);
  assert.match(app,/L1-L6 module load failures/);
  assert.match(app,/Some assigned modules could not be loaded/);
});
