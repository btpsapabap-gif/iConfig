const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const p=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

test('project selection invalidates stale async scope before fetching new modules',()=>{
  assert.match(p,/const scopeVersion=\+\+state\.projectScopeVersion/);
  assert.match(p,/state\.bronzeRequestVersion\+\+/);
  assert.match(p,/state\.silverRecords=\[\]/);
  assert.match(p,/state\.goldPayload=null/);
  assert.match(p,/state\.bronzeFrozen=false/);
  assert.match(p,/if\(scopeVersion!==state\.projectScopeVersion\)return/);
});

test('old Bronze fetch cannot repopulate a newly selected project or node',()=>{
  assert.match(p,/const requestVersion=\+\+state\.bronzeRequestVersion/);
  assert.match(p,/if\(state\.stage!==['"]bronze['"]\)return;const requestVersion=\+\+state\.bronzeRequestVersion;const projectVersion=state\.projectScopeVersion;const nodeId=state\.selectedNodeId;/);
  assert.match(p,/requestVersion!==state\.bronzeRequestVersion\|\|projectVersion!==state\.projectScopeVersion\|\|nodeId!==state\.selectedNodeId/);
});

test('old Silver and Gold requests cannot repopulate a new project scope',()=>{
  assert.match(p,/const projectVersion=state\.projectScopeVersion;const chosen=/);
  assert.match(p,/if\(projectVersion!==state\.projectScopeVersion\)return;const have=/);
  assert.match(p,/if\(projectVersion!==state\.projectScopeVersion\)return;state\.goldPayload=payload/);
});


test('project administration exposes a DELETE endpoint and deletes module links before project',()=>{
  const fs=require('fs');
  const path=require('node:path');
  const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  const admin=fs.readFileSync(path.join(__dirname,'..','server','supabaseAdmin.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','styles.css'),'utf8');
  assert.match(index,/app\.delete\('\/api\/admin\/projects\/:projectId'/);
  assert.match(admin,/async function deleteProject\(projectId\)/);
  assert.match(admin,/iconfig_project_modules\?project_id=eq\./);
  assert.match(admin,/iconfig_projects\?project_id=eq\./);
  assert.match(app,/deleteAdminProject\(project\)/);
  assert.match(app,/method:'DELETE'/);
  assert.match(css,/\.project-delete-btn/);
});

test('globals.css is plain browser CSS and contains no unprocessed Tailwind directives',()=>{
  const fs=require('fs');
  const path=require('node:path');
  const css=fs.readFileSync(path.join(__dirname,'..','public','globals.css'),'utf8');
  assert.doesNotMatch(css,/@import ['"]tailwindcss/);
  assert.doesNotMatch(css,/@source /);
  assert.doesNotMatch(css,/@apply /);
  assert.doesNotMatch(css,/@theme /);
});

test('static assets are explicitly cache-busted for V91',()=>{
  const fs=require('fs');
  const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  assert.match(html,/globals\.css\?v=91/);
  assert.match(html,/styles\.css\?v=91/);
  assert.match(html,/app\.js\?v=91/);
});


test('project creation and module assignment are available to any authenticated active user',()=>{
  const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(index,/app\.post\('\/api\/admin\/projects',requireUser/);
  assert.match(index,/app\.put\('\/api\/admin\/projects\/:projectId\/modules',requireUser/);
  assert.doesNotMatch(index,/app\.post\('\/api\/admin\/projects',requireAdmin/);
  assert.match(app,/el\.bronzeAdminPanel\.hidden=false/);
});

test('Gold deployment has field-level duplicate checking and explicit overwrite',()=>{
  const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const versioning=fs.readFileSync(path.join(__dirname,'..','server','deploymentVersioning.js'),'utf8');
  assert.match(index,/app\.post\('\/api\/deploy\/check'/);
  assert.match(index,/ALREADY_DEPLOYED/);
  assert.match(index,/createDeploymentVersion/);
  assert.match(app,/Already deployed, want to overwrite it/);
  assert.match(app,/Field-level comparison/);
  assert.match(versioning,/function compareDeployments/);
  assert.match(versioning,/function hashDeployment/);
});

test('Audit Log is a first-class left-panel stage',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  assert.match(html,/data-layer="audit"/);
  assert.match(app,/async function renderAudit/);
  assert.match(index,/app\.get\('\/api\/audit-log'/);
});


test('login screen and role are not exposed in the application UI',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.doesNotMatch(html,/id=\"loginBackdrop\"/);
  assert.doesNotMatch(html,/id=\"logoutBtn\"/);
  assert.doesNotMatch(html,/id=\"sessionUser\"/);
  assert.doesNotMatch(app,/display_name\|\|user\.user_email} · \${user\.role}/);
});

test('Audit Log hides the process-directory middle pane and can show deployed target values',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','styles.css'),'utf8');
  const index=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
  const admin=fs.readFileSync(path.join(__dirname,'..','server','supabaseAdmin.js'),'utf8');
  assert.match(html,/data-layer="audit"/);
  assert.match(app,/layout.*audit-mode/);
  assert.match(app,/Show target values/);
  assert.match(app,/deploymentValueRows/);
  assert.match(css,/\.layout\.audit-mode \{ grid-template-columns: 190px 1fr; \}/);
  assert.match(css,/\.layout\.audit-mode \.tree-pane \{ display: none !important; \}/);
  assert.match(index,/app\.get\('\/api\/deploy\/versions\/:id'/);
  assert.match(admin,/async function getDeploymentVersionById/);
});


test('L1-L6 directory starts collapsed and requested SPRO module catalog is defined',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','v76_spro_modules.sql'),'utf8');
  assert.match(app,/state\.openNodes\.clear\(\);\s*renderTree\(\);/);
  assert.match(app,/id:'FI',name:'Financial Accounting \(New\)'/);
  assert.match(app,/id:'LG',name:'Logistics - General'/);
  assert.match(app,/id:'LE',name:'Logistics Execution'/);
  assert.match(app,/id:'PP',name:'Production Planning for Process Industries'/);
  assert.match(app,/id:'TM',name:'Time Management'/);
  assert.match(app,/id:'PY',name:'Payroll'/);
  assert.match(app,/id:'PM',name:'Personnel Management'/);
  for (const name of [
    'Enterprise Structure','Financial Accounting (New)','Controlling','Logistics - General',
    'Sales and Distribution','Materials Management','Logistics Execution','Quality Management',
    'Production','Production Planning for Process Industries','Project System','Time Management',
    'Payroll','Personnel Management'
  ]) assert.ok(sql.includes(name), `Missing module in SQL: ${name}`);
});

test('single project is automatically restored/opened for L1-L6 without Bronze or refresh', () => {
  const app = p;
  assert.match(app, /iconfig-selected-project-id/);
  assert.match(app, /state\.admin\.projects\.length===1/);
  assert.match(app, /await selectAdminProject\(initialProject\)/);
});
