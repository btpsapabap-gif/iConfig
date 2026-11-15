const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'spro_l1_l6_sequence.sql'),
  'utf8'
);
const treeSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'routes', 'tree.js'),
  'utf8'
);
const adminSource = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'supabaseAdmin.js'),
  'utf8'
);

test('SPRO Supabase cache table stores an explicit sibling sequence', () => {
  assert.match(sql, /sequence_no\s+INTEGER\s+NOT NULL/i);
  assert.match(sql, /UNIQUE \(module_name, language, tree_id, node_id\)/i);
  assert.match(sql, /UNIQUE \(module_code, language, tree_id, node_id\)/i);
  assert.match(sql, /parent_node_id, sequence_no/i);
});

test('SPRO runtime checks Supabase before OData and writes OData results back to Supabase', () => {
  const cacheCheck = treeSource.indexOf('supabaseAdmin.listSproHierarchy(moduleCode,language)');
  const odataFetch = treeSource.indexOf('fetchSproHierarchy(candidate,language)');
  const cacheWrite = treeSource.indexOf('supabaseAdmin.replaceSproHierarchy(flattened)');

  assert.ok(cacheCheck >= 0);
  assert.ok(odataFetch > cacheCheck);
  assert.ok(cacheWrite > odataFetch);
  assert.match(adminSource, /async function listSproHierarchy/);
  assert.match(adminSource, /async function replaceSproHierarchy/);
});
