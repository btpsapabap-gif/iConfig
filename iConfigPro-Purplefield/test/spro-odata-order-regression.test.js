const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const treeSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'routes', 'tree.js'),
  'utf8'
);
const abap = fs.readFileSync(
  path.join(__dirname, '..', 'ZCL_IM_SPRO_IMG_V71_SEQUENCE_FIX.abap'),
  'utf8'
);

test('OData refresh can bypass an existing Supabase cache', () => {
  assert.match(treeSource, /forceRefresh=false/);
  assert.match(treeSource, /!forceRefresh/);
  assert.match(treeSource, /req\.query\.refresh/);
});

test('SAP hierarchy order is not destroyed by ABAP sorting', () => {
  assert.doesNotMatch(abap, /SORT\s+et_nodes\s+BY\s+tree_id\s+node_level\s+node_id/i);
  assert.doesNotMatch(abap, /SORT\s+rt_hierarchy\s+BY\s+tree_id\s+node_level\s+parent_node_id\s+node_id/i);
  assert.match(abap, /Preserve the exact order returned by STREE_HIERARCHY_READ/i);
});

test('Persisted SAP SequenceNo is retained instead of recalculated from array position', () => {
  assert.match(
    treeSource,
    /const sequenceNo = Number\(node\._sequenceNo \?\? node\.sequence_no \?\? 0\)/
  );
  assert.doesNotMatch(treeSource, /const sequenceNo = index \+ 1;/);
  assert.doesNotMatch(treeSource, /sort\([^\n]*node_name|sort\([^\n]*name/i);
});

test('SAP parent_node_id is the authoritative tree relationship', () => {
  assert.match(treeSource, /byTreeAndNode/);
  assert.match(treeSource, /byNodeId/);
  assert.match(treeSource, /parentId && parentId !== r\._nodeId/);
  assert.match(treeSource, /parent\.children\.push\(r\)/);
  assert.doesNotMatch(treeSource, /if\s*\([^\n]*level[^\n]*\)\s*parent\.children\.push/);
});


test('Project L1–L6 loading is Supabase-first; explicit Refresh Source uses SAP OData', () => {
  const app = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'app.js'),
    'utf8'
  );
  assert.match(app, /async function loadAssignedSproTree\(modules, forceRefresh=false\)/);
  assert.match(app, /language=\$\{encodeURIComponent\(language\)\}\$\{forceRefresh\?'&refresh=1':''\}/);
  assert.match(app, /await loadAssignedSproTree\(state\.assignedModules,true\)/);
});
