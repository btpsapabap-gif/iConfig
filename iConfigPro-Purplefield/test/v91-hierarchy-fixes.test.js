const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const tree=fs.readFileSync(path.join(root,'server/routes/tree.js'),'utf8');
const sap=fs.readFileSync(path.join(root,'server/sapClient.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');

test('V91 timeout behavior is retained',()=>{
  assert.match(sap,/SAP_SPRO_IMG_TIMEOUT_MS \|\| '120000'/);
  assert.match(app,/api\(`\/api\/tree\/spro[^`]*`,\{\},120000\)/);
});

test('V91 MM Enterprise Structure branch fallback is removed in the SPRO module path',()=>{
  assert.doesNotMatch(tree,/isSparseDirectModuleTree/);
  assert.doesNotMatch(tree,/extractModuleBranchesFromEnterpriseTree/);
  assert.doesNotMatch(tree,/source='ODATA-BRANCH'/);
  assert.doesNotMatch(tree,/fetchSproHierarchy\('Enterprise Structure',language\)/);
});

test('V91 uses the iC brand mark and cache-busted assets',()=>{
  assert.match(html,/brand-mark">iC<\/span>/);
  assert.match(html,/globals\.css\?v=91/);
  assert.match(html,/styles\.css\?v=91/);
  assert.match(html,/app\.js\?v=91/);
});
