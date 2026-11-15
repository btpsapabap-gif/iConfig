const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const tree=fs.readFileSync(path.join(__dirname,'..','server','routes','tree.js'),'utf8');

function loaderSection(){
  const start=app.indexOf('async function loadAssignedSproTree');
  const end=app.indexOf('\nconst SPRO_MODULES=',start);
  return app.slice(start,end);
}

test('Project L1-L6 loader uses cache-first endpoint without forced refresh',()=>{
  const loader=loaderSection();
  assert.match(loader,/forceRefresh=false/);
  assert.match(loader,/language=\$\{encodeURIComponent\(language\)\}\$\{forceRefresh\?'&refresh=1':''\}/);
});

test('Normal Project open does not force OData refresh',()=>{
  const loader=loaderSection();
  assert.match(loader,/api\/tree\/spro\?moduleCode=\$\{encodeURIComponent\(requestedCode\)\}&language=\$\{encodeURIComponent\(language\)\}\$\{forceRefresh\?'&refresh=1':''\}/);
  assert.match(app,/await loadAssignedSproTree\(state\.assignedModules\);/);
});

test('Refresh Source explicitly forces OData refresh',()=>{
  assert.match(app,/await loadAssignedSproTree\(state\.assignedModules,true\)/);
});

test('Backend checks Supabase before OData and only calls OData for an empty cache',()=>{
  const cache=tree.indexOf('const cached=await supabaseAdmin.listSproHierarchy(moduleCode,language);');
  const cachedTree=tree.indexOf("return {tree:cachedTree.map(root=>({...root,module_code:moduleCode})),source:'SUPABASE'};");
  const odata=tree.indexOf('rows=await fetchSproHierarchy(candidate,language);');
  assert.ok(cache>=0 && cachedTree>cache && odata>cachedTree);
  assert.match(tree,/If there are zero rows, call SAP OData/);
});

test('Static hierarchy snapshot is not a runtime fallback',()=>{
  const loadStart=tree.indexOf('async function loadSproHierarchy(');
  const loadEnd=tree.indexOf("\nrouter.get('/')",loadStart);
  const loader=tree.slice(loadStart,loadEnd);
  assert.doesNotMatch(loader,/STATIC-FALLBACK/);
  assert.match(loader,/Static JSON is never a runtime hierarchy source/);
  assert.match(loader,/if\(mode === 'mock'\)/);
  const productionPath=loader.slice(loader.indexOf("if(mode === 'mock')"));
  assert.doesNotMatch(productionPath,/STATIC-FALLBACK/);
});

test('Malformed existing Supabase rows are not treated as an empty cache',()=>{
  assert.match(tree,/Supabase contains \$\{cached\.length\} L1-L6 row\(s\)/);
  assert.doesNotMatch(tree,/if\(!cachedTree\.length\)[\s\S]*?fetchSproHierarchy/);
});

test('Refresh Source remains the explicit OData refresh path',()=>{
  assert.match(tree,/const forceRefresh = \['1','true','x'\]/);
  assert.match(tree,/if\(canUseSupabase && !forceRefresh\)/);
  assert.match(tree,/No valid Supabase hierarchy exists for this module \(or the caller\n    \/\/ explicitly requested Refresh Source\)/);
});


test('Hierarchy source errors are returned as errors, not as empty success responses',()=>{
  const start=tree.indexOf("router.get('/spro'");
  const section=tree.slice(start);
  assert.match(section,/res\.status\(status\)\.json\(\{ error:/);
  assert.doesNotMatch(section,/res\.json\(\[\]\)/);
});
