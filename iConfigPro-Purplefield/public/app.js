(function(){
const state={tree:[],processTree:[],sproTree:[],sproModule:'',sproModuleName:'',assignedModules:[],treePath:[],admin:{configured:false,isAdmin:false,user:null,projects:[],modules:[],selectedProject:null,selectedModuleIds:new Set(),activeOption:'projects'},auditLogs:[],deploymentCheck:null,deploymentVersions:[],selectedNode:null,selectedNodeId:null,stage:'bronze',bronzeFrozen:false,openNodes:new Set(),bcsetId:localStorage.getItem('imigrate-bcset')||'',goldBcsetName:'',deployClient:'200',sourceMode:'mock',targetMode:'mock',deployConfigured:true,bronzeRecords:[],bronzeSelected:new Set(),bronzeTablesSelected:new Set(),bronzeExpanded:new Set(),silverRecords:[],goldPayload:null,projectScopeVersion:0,bronzeRequestVersion:0};
const $=id=>document.getElementById(id);
const el={connStatus:$('connStatus'),refreshSource:$('refreshSource'),bcsetInput:$('bcsetInput'),bcsetDatalist:$('bcsetDatalist'),tree:$('tree'),detailNodeName:$('detailNodeName'),detailNodeTables:$('detailNodeTables'),detailLayerChip:$('detailLayerChip'),stageActions:$('stageActions'),detailBody:$('detailBody'),treeScopeLabel:$('treeScopeLabel'),countBronze:$('countBronze'),countSilver:$('countSilver'),countGold:$('countGold'),countAudit:$('countAudit'),bucketsMeta:$('bucketsMeta'),bronzeAdminPanel:$('bronzeAdminPanel'),bronzeProjectsOption:$('bronzeProjectsOption'),bronzeModulesOption:$('bronzeModulesOption'),bronzeProjectsPanel:$('bronzeProjectsPanel'),bronzeModulesPanel:$('bronzeModulesPanel'),bronzeProjectList:$('bronzeProjectList'),bronzeModuleList:$('bronzeModuleList'),createProjectBtn:$('createProjectBtn'),saveProjectModulesBtn:$('saveProjectModulesBtn'),projectModalBackdrop:$('projectModalBackdrop'),newProjectName:$('newProjectName'),newProjectDescription:$('newProjectDescription'),projectCancelBtn:$('projectCancelBtn'),projectCreateConfirm:$('projectCreateConfirm'),projectCreateResult:$('projectCreateResult'),deployModalBackdrop:$('deployModalBackdrop'),deployModalBody:$('deployModalBody'),deployCancelBtn:$('deployCancelBtn'),deployConfirmBtn:$('deployConfirmBtn'),deployResult:$('deployResult'),addFieldBackdrop:$('addFieldBackdrop'),fieldSearch:$('fieldSearch'),fieldList:$('fieldList'),selectedFieldInfo:$('selectedFieldInfo'),newFieldValue:$('newFieldValue'),addFieldCancel:$('addFieldCancel'),addFieldConfirm:$('addFieldConfirm'),addFieldResult:$('addFieldResult'),addRowBackdrop:$('addRowBackdrop'),newRowTable:$('newRowTable'),newRowRecnumber:$('newRowRecnumber'),newRowKeyFields:$('newRowKeyFields'),addRowCancel:$('addRowCancel'),addRowConfirm:$('addRowConfirm'),addRowResult:$('addRowResult')};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=r=>`${r.table}#${r.recnumber}`;
const tables=n=>{
  const s=new Set();
  (function w(x){
    (x.tables||[]).forEach(t=>String(t).split(/\s*\/\s*/).map(v=>v.trim().toUpperCase()).filter(Boolean).forEach(v=>s.add(v)));
    (x.children||[]).forEach(w);
  })(n);
  return [...s];
};
const tTables=n=>tables(n).filter(t=>/^T[A-Z0-9_]*$/.test(t));
const tableMeta=new Map();
async function api(url,opt={},timeoutMs=30000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...opt,signal:controller.signal});
    let d={}; try{d=await r.json()}catch{}
    if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
    return d;
  }catch(e){
    if(e?.name==='AbortError') throw Error(`Request timed out: ${url}`);
    throw e;
  }finally{clearTimeout(timer);}
}
function setSessionUser(user){
  // Authentication remains enforced by the server, but the application no longer
  // exposes a login screen, logout control, or role label in the UI.
  if(!user)return;
}
async function ensureSession(){
  try{
    const s=await api('/api/session');
    document.body.dataset.authMode=s.mode||'local';
    if(s.user)setSessionUser(s.user);
    // Do not block the application with a login modal. BTP/XSUAA or the
    // configured local identity is expected to establish the authenticated user.
    return s;
  }catch(e){
    console.warn('[iConfigPro] session check failed:',e.message);
    document.body.dataset.authMode='unknown';
    return {authenticated:false,mode:'unknown',configured:false,user:null};
  }
}
async function initApplication(){
  el.tree.innerHTML='<div class="empty-state">Loading Process Directory…</div>';
  try{
    const [cfg,sets,meta]=await Promise.all([api('/api/config'),api('/api/bcsets'),api('/api/table-metadata')]);
    (meta.tables||[]).forEach(x=>tableMeta.set(x.table,x));
    Object.assign(state,{deployConfigured:cfg.deployConfigured,deployClient:cfg.deployClient||'200',sourceMode:cfg.mode,targetMode:cfg.targetMode,bcsetId:state.bcsetId||sets.default||''});
    el.bcsetInput.value=state.bcsetId;
    el.bcsetDatalist.innerHTML=(sets.bcsets||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.id)}</option>`).join('');
    renderStatus();
    el.bucketsMeta.innerHTML=`Source: <b>${esc(state.sourceMode)}</b><br>Target: <b>${esc(state.targetMode)}</b><br>Target client: <b>${esc(state.deployClient)}</b>`;
    // Never let the optional Supabase Admin/Projects lookup block the SAP
    // Process Directory. The hierarchy must render independently.
    await loadTree();
    loadAdmin().catch(()=>{});
  }catch(e){
    el.connStatus.textContent=e.message;
    el.connStatus.className='conn-status err';
    console.error('[iConfigPro] initialization failed',e);
    el.tree.innerHTML=`<div class="empty-state error-state">${esc(e.message)}</div>`;
  }
}
async function init(){
  const session=await ensureSession();
  if(!session)return;
  await initApplication();
}
function renderStatus(){el.connStatus.textContent=`Source ${state.sourceMode} · Target ${state.targetMode} · BC Set ${state.bcsetId||'(none)'}`;el.connStatus.className='conn-status ok';}
el.bcsetInput.addEventListener('change',()=>{const v=el.bcsetInput.value.trim();if(v&&v!==state.bcsetId){state.bcsetId=v;state.goldBcsetName=v;localStorage.setItem('imigrate-bcset',v);state.bronzeFrozen=false;state.silverRecords=[];resetBronze();state.goldPayload=null;renderStatus();render();}});el.bcsetInput.addEventListener('keydown',e=>{if(e.key==='Enter')el.bcsetInput.dispatchEvent(new Event('change'));});
el.refreshSource.onclick=async()=>{state.bronzeFrozen=false;state.silverRecords=[];resetBronze();state.goldPayload=null;renderStatus();if(state.assignedModules.length){el.tree.innerHTML='<div class="loading-state">Refreshing L1–L6 Process Directory from SAP OData…</div>';try{await loadAssignedSproTree(state.assignedModules,true);}catch(e){el.tree.innerHTML=`<div class="error-state">${esc(e.message)}</div>`;}return;}await loadTree();};
function resetBronze(){state.bronzeRecords=[];state.bronzeSelected.clear();state.bronzeTablesSelected.clear();state.bronzeExpanded.clear();}
async function loadTree(){
  const processTree=await api('/api/tree');
  state.processTree=processTree||[];
  state.sproTree=[];
  state.tree=state.processTree;
  populateBronzeModules();
  renderTree();
}
async function loadAssignedSproTree(modules, forceRefresh=false){
  const assigned=Array.isArray(modules)?modules:[];
  if(!assigned.length){state.sproTree=[];state.tree=[];renderTree();return;}
  const language='E';
  const unique=[...new Map(assigned.map(m=>{
    const code=String(m?.module_code||'').trim().toUpperCase();
    const name=String(m?.module_name||m?.name||'').trim();
    return [code||name.toUpperCase(),{code,name}];
  }).filter(x=>x[1].code||x[1].name)).values()];
  // Project-module assignment is keyed by spro_modules.module_code. Never
  // join the Process Directory by display name; SAP's IMG cache may contain
  // legacy labels such as "Financial Accounting" while the project stores FI.
  // Runtime source policy: Supabase is first. OData is called only when the
  // module hierarchy is genuinely absent, or when Refresh Source is explicit.
  const results=await Promise.allSettled(unique.map(async m=>{
    const requestedCode=m.code||m.name;
    const value=await api(`/api/tree/spro?moduleCode=${encodeURIComponent(requestedCode)}&language=${encodeURIComponent(language)}${forceRefresh?'&refresh=1':''}`,{},120000);
    // Enforce the requested project-module identity at the client boundary.
    // This prevents a legacy cache row carrying an old module name from
    // causing a successful FI/CO/MM/etc hierarchy to be filtered out.
    return {module:m,value};
  }));

  const failures=[];
  const trees=[];
  results.forEach((result,index)=>{
    const module=unique[index]||{};
    if(result.status==='fulfilled'){
      const value=result.value?.value;
      if(Array.isArray(value)){
        value.forEach(root=>trees.push({
          ...root,
          module_code:String(module.code||root.module_code||'').trim().toUpperCase(),
          module_name:module.name||root.module_name||''
        }));
      }
    }else{
      failures.push(`${module.code||module.name}: ${result.reason?.message||result.reason||'hierarchy unavailable'}`);
    }
  });

  state.sproTree=trees;
  state.tree=assignedTreeRoots();
  // L1–L6 must start collapsed whenever a project/module hierarchy is loaded.
  state.openNodes.clear();
  renderTree();
  if(failures.length){
    console.error('[iConfigPro] L1-L6 module load failures:',failures);
    const existing=el.tree.querySelector('.empty-state');
    if(existing && !trees.length){
      existing.innerHTML=`L1–L6 hierarchy could not be loaded.<br><small>${esc(failures.join(' | '))}</small>`;
    }else{
      const warning=document.createElement('div');
      warning.className='empty-state error-state';
      warning.innerHTML=`Some assigned modules could not be loaded.<br><small>${esc(failures.join(' | '))}</small>`;
      el.tree.appendChild(warning);
    }
  }
}

const SPRO_MODULES=[
  {id:'ER',name:'Enterprise Structure'},
  {id:'FI',name:'Financial Accounting (New)'},
  {id:'CO',name:'Controlling'},
  {id:'LG',name:'Logistics - General'},
  {id:'SD',name:'Sales and Distribution'},
  {id:'MM',name:'Materials Management'},
  {id:'LE',name:'Logistics Execution'},
  {id:'QM',name:'Quality Management'},
  {id:'PD',name:'Production'},
  {id:'PP',name:'Production Planning for Process Industries'},
  {id:'PS',name:'Project System'},
  {id:'TM',name:'Time Management'},
  {id:'PY',name:'Payroll'},
  {id:'PM',name:'Personnel Management'}
];
function moduleDefinitionFor(m){
  const code=String(m?.module_code||'').trim();
  return SPRO_MODULES.find(x=>x.id===code)||SPRO_MODULES.find(x=>x.name===m?.module_name)||null;
}
function populateBronzeModules(){
  const list=el.bronzeModuleList;
  if(list){
    const modules=state.admin.modules.length?state.admin.modules:SPRO_MODULES.map((m,i)=>({module_id:i+1,module_code:m.id,module_name:m.name,display_order:i+1}));
    list.innerHTML='';
    modules.forEach(m=>{
      const row=document.createElement('label'); row.className='bronze-module-item';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state.admin.selectedModuleIds.has(Number(m.module_id));
      cb.onchange=()=>{
        const id=Number(m.module_id);
        if(cb.checked){
          state.admin.selectedModuleIds.add(id);
          const def=moduleDefinitionFor(m);
          if(def)selectBronzeModule(def.id);
        }else{
          state.admin.selectedModuleIds.delete(id);
          if(state.sproModule===moduleDefinitionFor(m)?.id){
            const next=modules.find(x=>state.admin.selectedModuleIds.has(Number(x.module_id)));
            const def=moduleDefinitionFor(next);
            if(def)selectBronzeModule(def.id); else selectBronzeModule('');
          }
        }
        el.saveProjectModulesBtn.disabled=!state.admin.selectedProject;
      };
      const span=document.createElement('span'); span.textContent=m.module_name;
      row.append(cb,span);
      row.onclick=(event)=>{if(event.target===cb)return; const def=moduleDefinitionFor(m); if(def)selectBronzeModule(def.id);};
      list.appendChild(row);
    });
  }
}
function assignedTreeRoots(){
  const assigned=Array.isArray(state.assignedModules)?state.assignedModules:[];
  const codes=new Set(assigned.map(m=>String(m?.module_code||'').trim().toUpperCase()).filter(Boolean));
  // Backward compatibility for a project record created before canonical
  // module codes were introduced. Prefer module_code; only fall back to the
  // current catalog name when the code is absent.
  assigned.forEach(m=>{
    if(String(m?.module_code||'').trim())return;
    const def=SPRO_MODULES.find(x=>x.name.toLowerCase()===String(m?.module_name||m?.name||'').trim().toLowerCase());
    if(def)codes.add(def.id);
  });
  const showAllAssigned=Boolean(state.admin.selectedProject) && state.admin.activeOption==='projects';
  const wanted=showAllAssigned
    ? codes
    : (state.sproModule ? new Set([String(state.sproModule).trim().toUpperCase()]) : codes);
  return (state.sproTree||[]).filter(n=>wanted.has(String(n.module_code||'').trim().toUpperCase()));
}
function renderAssignedModules(){
  // Assigned project modules are displayed directly as L1 roots in the tree.
}
function selectBronzeModule(id){
  state.sproModule=id||'';
  const definition=SPRO_MODULES.find(m=>m.id===state.sproModule);
  state.sproModuleName=definition?.name||'';
  state.selectedNode=null; state.selectedNodeId=null; resetBronze(); state.goldPayload=null;
  state.tree=assignedTreeRoots();
  // Keep the L1–L6 Process Directory collapsed after module changes.
  // Expansion is always an explicit user action.
  state.openNodes.clear();
  updateTreeScope();
  renderTree(); render();
}
function updateTreeScope(){
  if(!el.treeScopeLabel)return;
  el.treeScopeLabel.textContent='';
}
function toggleTreeNode(n){
  const has=(n.children||[]).length>0;
  if(!has)return;
  if(state.openNodes.has(n.id)) state.openNodes.delete(n.id);
  else state.openNodes.add(n.id);
  renderTree();
}
function selectTreeNode(n){
  state.bronzeRequestVersion++;
  // Every hierarchy level is selectable. The selected level determines the
  // table scope shown in the right-hand Bronze panel:
  // L1 = all tables below L1, L2 = all tables below L2, ... L6 = its tables.
  state.selectedNode=n;
  state.selectedNodeId=n.id;
  resetBronze();
  state.goldPayload=null;
  renderTree();
  render();
}
function navigateTreeNode(n){selectTreeNode(n);}
function navigateTreeBack(){/* no parent/back navigation in the inline tree */}
function nodeEl(n,d){
  const w=document.createElement('div'); w.className='node';
  const r=document.createElement('div'); r.className='node-row'+(n.id===state.selectedNodeId?' selected':'');
  const has=(n.children||[]).length>0;
  const isOpen=has&&state.openNodes.has(n.id);
  const c=document.createElement('button');
  c.type='button'; c.className='node-caret '+(has?'branch':'leaf');
  c.textContent=has?(isOpen?'▼':'▶'):'•';
  c.setAttribute('aria-label',has?(isOpen?'Collapse':'Expand'):'Select');
  // Arrow controls expansion only; it must never change the right panel.
  c.onclick=e=>{e.stopPropagation();toggleTreeNode(n);};
  r.appendChild(c);
  const badge=document.createElement('span'); badge.className='node-level'; badge.textContent=`L${n.level||d+1}`; r.appendChild(badge);
  const name=document.createElement('span'); name.className='node-name'; name.textContent=n.name+(tables(n).length?` (${tables(n).length})`:''); r.appendChild(name);
  // Clicking the node label selects that hierarchy scope and refreshes the
  // right panel with all T Tables associated with this node and descendants.
  r.onclick=()=>selectTreeNode(n);
  w.appendChild(r);
  if(has&&isOpen){
    const children=document.createElement('div'); children.className='node-children';
    n.children.forEach(ch=>children.appendChild(nodeEl(ch,d+1)));
    w.appendChild(children);
  }
  return w;
}
function renderTree(){
  el.tree.innerHTML='';
  const roots=assignedTreeRoots();
  state.tree=roots;
  if(!roots.length){
    el.tree.innerHTML=state.admin.selectedProject
      ? '<div class="empty-state">No L1–L6 hierarchy data is available for the modules assigned to this project.</div>'
      : '<div class="empty-state">Select a project with assigned modules to view its L1–L6 Process Directory.</div>';
    return;
  }
  roots.forEach(n=>el.tree.appendChild(nodeEl(n,0)));
}
async function loadAdmin(){
  try{
    const me=await api('/api/admin/me',{},8000);
    state.admin.configured=!!me.configured;
    state.admin.isAdmin=!!me.isAdmin;
    state.admin.user=me.user||null;
    // Projects and Modules are no longer ADMIN-only. Any authenticated active
    // iConfigPro user can create a project, assign modules, and continue.
    el.bronzeAdminPanel.hidden=false;
    if(el.createProjectBtn) el.createProjectBtn.disabled=false;
    const [mods,projects]=await Promise.all([api('/api/admin/modules',{},8000),api('/api/admin/projects',{},8000)]);
    state.admin.modules=mods.modules||[];
    state.admin.projects=projects.projects||[];
    renderAdminProjects();
    populateBronzeModules();

    // Restore the last project automatically. If there is only one project,
    // open it immediately so the L1–L6 Process Directory is available without
    // requiring the user to click Bronze -> Projects -> Open or refresh.
    const savedProjectId=String(localStorage.getItem('iconfig-selected-project-id')||'').trim();
    const savedProject=state.admin.projects.find(p=>String(p.project_id)===savedProjectId);
    const initialProject=savedProject || (state.admin.projects.length===1 ? state.admin.projects[0] : null);
    if(initialProject){
      await selectAdminProject(initialProject);
    }
  }catch(e){
    el.bronzeAdminPanel.hidden=true;
  }
}
function renderAdminProjects(){
  const box=el.bronzeProjectList; if(!box)return; box.innerHTML='';
  if(!state.admin.projects.length){box.innerHTML='<div class="project-empty">No projects yet. Create a new project.</div>';return;}
  state.admin.projects.forEach(p=>{
    const item=document.createElement('div');
    item.className='project-item'+(state.admin.selectedProject?.project_id===p.project_id?' selected':'');

    const info=document.createElement('div');
    info.className='project-item-main';
    const title=document.createElement('b');
    title.textContent=p.project_name||'';
    const description=document.createElement('small');
    description.textContent=p.project_description||'No description';
    const modules=document.createElement('span');
    modules.className='project-modules';
    const moduleRows=Array.isArray(p.modules)?p.modules:[];
    const moduleNames=moduleRows.map(m=>m.module_name||m.module?.module_name).filter(Boolean);
    modules.innerHTML=moduleNames.length?moduleNames.map(n=>`<span class="project-module-pill">${esc(n)}</span>`).join(''):'<span class="project-no-modules">No modules assigned</span>';
    info.append(title,description,modules);

    const actions=document.createElement('div');
    actions.className='project-item-actions';
    const selectBtn=document.createElement('button');
    selectBtn.type='button';
    selectBtn.className='project-select-btn';
    selectBtn.textContent='Open';
    selectBtn.onclick=()=>selectAdminProject(p);

    // Existing project module assignments are editable from the Project card.
    // Edit opens the same Modules selector used during project setup, with the
    // current assignments pre-selected. Saving writes the exact selected set.
    const editModulesBtn=document.createElement('button');
    editModulesBtn.type='button';
    editModulesBtn.className='project-select-btn project-edit-modules-btn';
    editModulesBtn.textContent='Edit Modules';
    editModulesBtn.title='Select or unselect modules for this project';
    editModulesBtn.onclick=async event=>{
      event.stopPropagation();
      try{
        await selectAdminProject(p);
        if(state.admin.selectedProject?.project_id===p.project_id){
          el.bronzeModulesOption.click();
        }
      }catch(e){
        alert(`Could not edit project modules: ${e.message}`);
      }
    };

    const deleteBtn=document.createElement('button');
    deleteBtn.type='button';
    deleteBtn.className='project-delete-btn';
    deleteBtn.title=`Delete ${p.project_name||'project'}`;
    deleteBtn.textContent='Delete';
    deleteBtn.onclick=event=>{event.stopPropagation();deleteAdminProject(p);};
    actions.append(selectBtn,editModulesBtn,deleteBtn);

    item.append(info,actions);
    item.onclick=()=>selectAdminProject(p);
    box.appendChild(item);
  });
}
async function deleteAdminProject(project){
  const projectId=String(project?.project_id||'').trim();
  if(!projectId)return;
  const projectName=String(project?.project_name||'project').trim();
  if(!window.confirm(`Delete project "${projectName}"?\n\nThis removes the project and its assigned module links. This action cannot be undone.`))return;

  const wasSelected=state.admin.selectedProject?.project_id===projectId;
  try{
    await api(`/api/admin/projects/${encodeURIComponent(projectId)}`,{method:'DELETE'});
    state.admin.projects=state.admin.projects.filter(p=>String(p.project_id)!==projectId);

    if(wasSelected){
      state.projectScopeVersion++;
      state.bronzeRequestVersion++;
      state.admin.selectedProject=null;
      localStorage.removeItem('iconfig-selected-project-id');
      state.admin.selectedModuleIds=new Set();
      state.assignedModules=[];
      state.sproTree=[];
      state.sproModule='';
      state.sproModuleName='';
      state.selectedNode=null;
      state.selectedNodeId=null;
      state.stage='bronze';
      state.bronzeFrozen=false;
      state.silverRecords=[];
      state.goldPayload=null;
      resetBronze();
      el.saveProjectModulesBtn.disabled=true;
      document.querySelectorAll('.bucket-btn').forEach(b=>b.classList.toggle('active',b.dataset.layer==='bronze'));
      el.detailLayerChip.textContent='BRONZE';
      el.detailLayerChip.className='detail-layer-chip bronze';
    }

    renderAdminProjects();
    populateBronzeModules();
    renderTree();
    render();
  }catch(e){
    alert(`Could not delete project: ${e.message}`);
  }
}
async function selectAdminProject(project){
  // Invalidate every outstanding async Bronze/Silver operation immediately.
  // This prevents a response from the previously selected project from
  // repopulating the new project's right panel after the user switches.
  const scopeVersion=++state.projectScopeVersion;
  state.bronzeRequestVersion++;
  state.admin.selectedProject=project;
  localStorage.setItem('iconfig-selected-project-id',String(project?.project_id||''));
  state.admin.selectedModuleIds=new Set();
  state.sproModule='';
  state.sproModuleName='';
  state.selectedNode=null;
  state.selectedNodeId=null;
  state.silverRecords=[];
  state.goldPayload=null;
  state.bronzeFrozen=false;
  resetBronze();
  state.stage='bronze';
  document.querySelectorAll('.bucket-btn').forEach(b=>b.classList.toggle('active',b.dataset.layer==='bronze'));
  el.detailLayerChip.textContent='BRONZE';
  el.detailLayerChip.className='detail-layer-chip bronze';
  // Clear the old project's right panel immediately, before the new
  // project's module request completes. Show an explicit loading state in
  // the L1-L6 pane so the user does not have to refresh the browser.
  renderAdminProjects();
  el.tree.innerHTML='<div class="loading-state">Loading assigned L1–L6 Process Directory…</div>';
  render();
  try{
    const d=await api(`/api/admin/projects/${encodeURIComponent(project.project_id)}/modules`);
    if(scopeVersion!==state.projectScopeVersion)return;
    const assigned=d.modules||[];
    state.admin.selectedModuleIds=new Set(assigned.map(x=>Number(x.module_id)));
    state.assignedModules=assigned.map(x=>x.module||x).filter(Boolean);
    project.modules=state.assignedModules;
    renderAdminProjects();
    populateBronzeModules();
    el.saveProjectModulesBtn.disabled=false;
    await loadAssignedSproTree(state.assignedModules);
    render();
    el.bronzeProjectsOption.click();
  }catch(e){alert(e.message);}
}
el.bronzeProjectsOption.onclick=()=>{state.admin.activeOption='projects';el.bronzeProjectsOption.classList.add('active');el.bronzeModulesOption.classList.remove('active');el.bronzeProjectsPanel.hidden=false;el.bronzeModulesPanel.hidden=true;};
el.bronzeModulesOption.onclick=()=>{state.admin.activeOption='modules';el.bronzeModulesOption.classList.add('active');el.bronzeProjectsOption.classList.remove('active');el.bronzeProjectsPanel.hidden=true;el.bronzeModulesPanel.hidden=false;populateBronzeModules();};
el.createProjectBtn.onclick=()=>{el.projectCreateResult.textContent='';el.newProjectName.value='';el.newProjectDescription.value='';el.projectModalBackdrop.hidden=false;};
el.projectCancelBtn.onclick=()=>el.projectModalBackdrop.hidden=true;
el.projectCreateConfirm.onclick=async()=>{const name=el.newProjectName.value.trim();if(!name){el.projectCreateResult.textContent='Project name is required.';return;}el.projectCreateConfirm.disabled=true;try{const d=await api('/api/admin/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectName:name,description:el.newProjectDescription.value.trim()})});el.projectModalBackdrop.hidden=true;d.project.modules=[];state.admin.projects.unshift(d.project);await selectAdminProject(d.project);el.bronzeProjectsOption.click();}catch(e){el.projectCreateResult.textContent=e.message;}finally{el.projectCreateConfirm.disabled=false;}};
el.saveProjectModulesBtn.onclick=async()=>{if(!state.admin.selectedProject)return;el.saveProjectModulesBtn.disabled=true;try{const d=await api(`/api/admin/projects/${encodeURIComponent(state.admin.selectedProject.project_id)}/modules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({moduleIds:[...state.admin.selectedModuleIds]})});state.admin.selectedModuleIds=new Set((d.modules||[]).map(x=>Number(x.module_id)));state.assignedModules=(d.modules||[]).map(x=>x.module||x).filter(Boolean);state.admin.selectedProject.modules=state.assignedModules;const p=state.admin.projects.find(x=>x.project_id===state.admin.selectedProject.project_id);if(p)p.modules=state.admin.selectedProject.modules;state.selectedNode=null;state.selectedNodeId=null;resetBronze();state.goldPayload=null;await loadAssignedSproTree(state.assignedModules);renderAdminProjects();renderTree();render();el.bronzeProjectsOption.click();alert('Modules saved to project.');}catch(e){alert(e.message);}finally{el.saveProjectModulesBtn.disabled=false;}};
function setStage(s){
  const previous=state.stage;
  // Cancel any outstanding asynchronous Bronze extraction when the user changes layers.
  // A late Bronze response must never overwrite Audit/Silver/Gold controls.
  if(s!==previous){state.bronzeRequestVersion++;}
  if(s==='bronze'){resetBronze();}
  if(s==='bronze'&&previous==='silver'){renderSilver();}
  state.stage=s;
  document.querySelectorAll('.bucket-btn').forEach(b=>b.classList.toggle('active',b.dataset.layer===s));
  document.querySelector('.layout')?.classList.toggle('audit-mode',s==='audit');
  el.detailLayerChip.textContent=s==='audit'?'AUDIT LOG':s.toUpperCase();
  el.detailLayerChip.className='detail-layer-chip '+s;
  render();
}
document.querySelectorAll('.bucket-btn').forEach(b=>b.onclick=()=>setStage(b.dataset.layer));
function updateCounts(){
  el.countBronze.textContent=state.bronzeSelected.size?`${state.bronzeSelected.size} selected`:'';
  el.countSilver.textContent=state.silverRecords.length?`${state.silverRecords.length} staged`:'';
  el.countGold.textContent=state.goldPayload?`${state.goldPayload.DeployTableSet.length} table(s)`:'';
  if(el.countAudit)el.countAudit.textContent=state.auditLogs.length?`${state.auditLogs.length}`:'';
}
async function render(){
  updateCounts();
  if(state.stage==='bronze')return renderBronze();
  if(state.stage==='silver')return renderSilver();
  if(state.stage==='gold')return renderGold();
  return renderAudit();
}
async function renderAudit(){
  el.detailNodeName.textContent='Audit Log';
  el.detailNodeTables.textContent=state.admin.selectedProject?`Project: ${state.admin.selectedProject.project_name}`:'All project activity available to this user';
  el.stageActions.innerHTML='<button class="btn btn-secondary" id="refreshAuditBtn">Refresh</button>';
  $('refreshAuditBtn').onclick=loadAuditLogs;
  el.detailBody.innerHTML='<div class="loading-state">Loading audit history…</div>';
  await loadAuditLogs();
}
function formatAuditDetails(details){
  if(!details)return '';
  try{return JSON.stringify(details,null,2);}catch{return String(details);}
}
function isDeploymentAudit(row){return String(row?.action||'').startsWith('GOLD_DEPLOYMENT_');}
function deploymentValueRows(payload){
  const rows=[];
  for(const table of (payload?.DeployTableSet||[])){
    const tableName=table?.Tablename||table?.TableName||table?.tableName||table?.Table||table?.table||'';
    for(const rec of (table?.DeployRowSet||[])){
      const recNo=rec?.Recnumber??rec?.RecNumber??rec?.recnumber??rec?.RecNo??'';
      for(const field of (rec?.DeployFieldSet||[])){
        rows.push({table:String(tableName),recnumber:String(recNo),field:String(field?.Name??field?.FieldName??field?.fieldName??field?.Field??''),value:String(field?.Value??field?.value??'')});
      }
    }
  }
  return rows;
}
async function showAuditDeployment(row,container){
  container.innerHTML='<div class="loading-state">Loading deployed values…</div>';
  try{
    const id=String(row.entity_id||'').trim();
    if(!id){container.innerHTML='<div class="audit-detail-empty">Deployment version identifier is unavailable.</div>';return;}
    const d=await api(`/api/deploy/versions/${encodeURIComponent(id)}`,{},10000);
    const values=deploymentValueRows(d.version?.payload||{});
    const head=document.createElement('div');head.className='audit-deployment-head';
    head.innerHTML=`<div><b>Target values deployed</b><span>${esc(String(d.version?.bcset_id||''))} · v${esc(String(d.version?.version||''))} · Client ${esc(String(d.version?.target_client||''))}</span></div><div class="audit-deployment-meta">${values.length} field value(s)</div>`;
    container.innerHTML='';container.appendChild(head);
    if(!values.length){container.insertAdjacentHTML('beforeend','<div class="audit-detail-empty">No field-level deployment values were stored for this version.</div>');return;}
    const table=document.createElement('table');table.className='audit-values-table';
    table.innerHTML='<thead><tr><th>Table</th><th>Rec#</th><th>Field</th><th>Value</th></tr></thead>';
    const body=document.createElement('tbody');
    values.forEach(v=>{const tr=document.createElement('tr');[v.table,v.recnumber,v.field,v.value].forEach(x=>{const td=document.createElement('td');td.textContent=x;tr.appendChild(td)});body.appendChild(tr);});
    table.appendChild(body);container.appendChild(table);
  }catch(e){container.innerHTML=`<div class="error-state">${esc(e.message)}</div>`;}
}
async function loadAuditLogs(){
  try{
    const projectId=state.admin.selectedProject?.project_id||'';
    const q=projectId?`?projectId=${encodeURIComponent(projectId)}&limit=200`:'?limit=200';
    const d=await api('/api/audit-log'+q,{},8000);
    state.auditLogs=d.logs||[];
    const rows=state.auditLogs;
    el.countAudit.textContent=rows.length?String(rows.length):'';
    if(!rows.length){el.detailBody.innerHTML='<div class="empty-state">No audit entries yet.</div>';return;}
    const table=document.createElement('table');table.className='audit-table';
    table.innerHTML='<thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>';
    const body=document.createElement('tbody');
    rows.forEach(row=>{
      const tr=document.createElement('tr');
      tr.className=isDeploymentAudit(row)?'audit-deployment-row':'';
      const when=new Date(row.created_at||'').toLocaleString();
      const user=row.display_name||row.user_email||row.user_id||'—';
      const entity=[row.entity_type,row.entity_name||row.entity_id].filter(Boolean).join(' · ')||'—';
      const details=row.details&&typeof row.details==='object'?JSON.stringify(row.details):String(row.details||'');
      [when,user,row.action||'—',entity,details].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});
      body.appendChild(tr);
      if(isDeploymentAudit(row)){
        const detailTr=document.createElement('tr');detailTr.className='audit-deployment-values-row';
        const td=document.createElement('td');td.colSpan=5;
        const wrap=document.createElement('div');wrap.className='audit-deployment-values';wrap.hidden=true;
        const button=document.createElement('button');button.className='btn btn-secondary audit-show-values';button.textContent='Show target values';
        button.onclick=async()=>{wrap.hidden=!wrap.hidden;if(!wrap.hidden){button.textContent='Hide target values';await showAuditDeployment(row,wrap);}else button.textContent='Show target values';};
        td.appendChild(button);td.appendChild(wrap);detailTr.appendChild(td);body.appendChild(detailTr);
      }
    });
    table.appendChild(body);el.detailBody.innerHTML='';el.detailBody.appendChild(table);
  }catch(e){el.detailBody.innerHTML=`<div class="error-state">${esc(e.message)}</div>`;}
}

function initBronzeSelection(){const tbls=tables(state.selectedNode);state.bronzeTablesSelected=new Set(tbls);state.bronzeSelected=new Set(state.bronzeRecords.map(key));}
function closeTablesModal(){const backdrop=document.getElementById('tablesModalBackdrop');if(backdrop)backdrop.hidden=true;}
function openTablesModal(nodeTables){const backdrop=document.getElementById('tablesModalBackdrop');const list=document.getElementById('tablesModalList');const title=document.getElementById('tablesModalTitle');if(!backdrop||!list)return;const name=state.selectedNode?.name||'Selected node';if(title)title.textContent=`T Tables Associated — ${name}`;list.innerHTML='';if(!nodeTables.length){const empty=document.createElement('div');empty.className='tables-modal-empty';empty.textContent='No T tables are associated with this IMG hierarchy node or its descendants.';list.appendChild(empty);}else{const frag=document.createDocumentFragment();nodeTables.forEach(table=>{const item=document.createElement('div');item.className='tables-modal-item';item.textContent=table;frag.appendChild(item);});list.appendChild(frag);}backdrop.hidden=false;}
function renderTablesButton(nodeTables){el.detailNodeTables.innerHTML='';const button=document.createElement('button');button.type='button';button.className='btn tables-view-btn';button.textContent='T Tables Associated';button.title=`View ${nodeTables.length} associated T table${nodeTables.length===1?'':'s'}`;button.onclick=e=>{e.stopPropagation();openTablesModal(nodeTables);};el.detailNodeTables.appendChild(button);}
async function renderBronze(){if(state.stage!=='bronze')return;const requestVersion=++state.bronzeRequestVersion;const projectVersion=state.projectScopeVersion;const nodeId=state.selectedNodeId;if(!state.selectedNode){el.detailNodeName.textContent='';el.detailNodeTables.textContent='';el.stageActions.innerHTML='';el.detailBody.innerHTML='';return;}el.detailNodeName.textContent=state.selectedNode.name;el.detailNodeTables.innerHTML='';el.stageActions.innerHTML='';const nodeTables=tTables(state.selectedNode);renderTablesButton(nodeTables);if(!nodeTables.length){el.stageActions.innerHTML='';el.detailBody.innerHTML='<div class="empty-state">No T-tables are associated with this IMG hierarchy node or its descendants. Select a lower IMG activity/configuration node to extract configuration.</div>';return;}if(!state.bronzeRecords.length){el.detailBody.innerHTML='<div class="loading-state">Extracting Bronze…</div>';try{const d=await api(`/api/layers/bronze/${encodeURIComponent(state.selectedNode.id)}?bcset=${encodeURIComponent(state.bcsetId)}&tables=${encodeURIComponent(nodeTables.join(','))}`);if(state.stage!=='bronze'||requestVersion!==state.bronzeRequestVersion||projectVersion!==state.projectScopeVersion||nodeId!==state.selectedNodeId)return;state.bronzeRecords=d.records||[];if(state.bronzeRecords.length){initBronzeSelection();}if((d.recordCount||0)===0){const diag=d.diagnostics||{};const returned=(d.returnedTables||[]).slice(0,30).join(', ');el.stageActions.innerHTML='';el.detailBody.innerHTML='<div class="empty-state">BC Set returned '+(d.sourceRowCount||0)+' row(s), but none matched this process node.<br><br><b>Mapped properties:</b> BC Set='+esc(diag.bcsetProperty||'?')+', Table='+esc(diag.tableProperty||'?')+', Record='+esc(diag.recordProperty||'?')+', Field='+esc(diag.fieldProperty||'?')+', Value='+esc(diag.valueProperty||'?')+'<br><br><b>Tables returned by SAP:</b> '+esc(returned||'(none)')+'</div>';return;}}catch(e){el.detailBody.innerHTML=`<div class="error-state">${esc(e.message)}</div>`;return;}}
const selected=state.bronzeSelected.size;const allTables=nodeTables.length>0&&nodeTables.every(t=>state.bronzeTablesSelected.has(t));if(state.bronzeFrozen){el.stageActions.innerHTML='<div class="stage-freeze-note">Bronze is frozen while Silver contains staged records. Clear Silver to select Bronze records again.</div>';}else{el.stageActions.innerHTML=`<label class="master-select"><input id="allBronzeTables" type="checkbox" ${allTables?'checked':''}> Select all</label><button class="btn btn-primary" id="toSilver" ${selected?'':'disabled'}>Add ${selected||''} selected to Silver →</button>`;$('allBronzeTables').onchange=e=>toggleAllTables(e.target.checked);$('toSilver').onclick=toSilver;}renderBronzeTableGrid(nodeTables);}
function toggleAllTables(on){if(state.bronzeFrozen)return;const ts=tables(state.selectedNode);state.bronzeTablesSelected=new Set(on?ts:[]);state.bronzeRecords.forEach(r=>on?state.bronzeSelected.add(key(r)):state.bronzeSelected.delete(key(r)));renderBronze();}
function toggleTable(table,on){if(state.bronzeFrozen)return;if(on)state.bronzeTablesSelected.add(table);else state.bronzeTablesSelected.delete(table);state.bronzeRecords.filter(r=>r.table===table).forEach(r=>on?state.bronzeSelected.add(key(r)):state.bronzeSelected.delete(key(r)));renderBronze();}
function toggleRecord(r,on){if(state.bronzeFrozen)return;if(on){state.bronzeSelected.add(key(r));state.bronzeTablesSelected.add(r.table);}else state.bronzeSelected.delete(key(r));renderBronze();}
function toggleTableValues(table){state.bronzeExpanded.has(table)?state.bronzeExpanded.delete(table):state.bronzeExpanded.add(table);renderBronzeTableGrid(tables(state.selectedNode));}
function renderBronzeTableGrid(nodeTables){el.detailBody.innerHTML='';const wrap=document.createElement('div');wrap.className='bronze-grid-wrap';const table=document.createElement('table');table.className='bronze-grid';table.innerHTML='<thead><tr><th class="sel-col"></th><th class="table-col">Table Name</th><th>Description</th><th>Type</th><th>Key Strategy</th><th class="count-col">Records</th></tr></thead>';const body=document.createElement('tbody');nodeTables.forEach(tbl=>{const meta=tableMeta.get(tbl)||{table:tbl,desc:'Config Table',type:'Domain Table',key:'KEY'};const rs=state.bronzeRecords.filter(r=>r.table===tbl);const selectedRows=rs.filter(r=>state.bronzeSelected.has(key(r))).length;const on=state.bronzeTablesSelected.has(tbl);const open=state.bronzeExpanded.has(tbl);const tr=document.createElement('tr');tr.className='bronze-table-row';tr.innerHTML=`<td class="sel-col"><input type="checkbox" ${on?'checked':''} ${state.bronzeFrozen?'disabled':''}></td><td class="table-col"><button class="expand-btn" title="${open?'Collapse':'Expand'} ${esc(tbl)}">${open?'▾':'▸'}</button><span class="tbl-link">${esc(tbl)}</span>${meta.verify?' <span class="verify">⚠</span>':''}</td><td>${esc(meta.desc||'Config Table')}</td><td><span class="type-badge">${esc(meta.type||'Config Table')}</span></td><td><code>${esc(meta.key||'KEY')}</code></td><td class="count-col"><b>${rs.length}</b>${selectedRows!==rs.length?`<span class="selected-mini"> ${selectedRows} selected</span>`:''}</td>`;tr.querySelector('input').onchange=e=>toggleTable(tbl,e.target.checked);tr.querySelector('.expand-btn').onclick=()=>toggleTableValues(tbl);tr.querySelector('.tbl-link').onclick=()=>toggleTableValues(tbl);body.appendChild(tr);
if(open){const panel=document.createElement('tr');panel.className='value-row';const td=document.createElement('td');td.colSpan=6;td.appendChild(renderRecordPanel(tbl,rs));panel.appendChild(td);body.appendChild(panel);}});table.appendChild(body);wrap.appendChild(table);el.detailBody.appendChild(wrap);updateCounts();}
function renderRecordPanel(tbl,rs){const panel=document.createElement('div');panel.className='record-panel';const selected=rs.filter(r=>state.bronzeSelected.has(key(r))).length;const head=document.createElement('div');head.className='record-panel-head';head.innerHTML=`<span><b>${esc(tbl)}</b> · ${rs.length} record(s) · <b>${selected} selected</b></span><button class="btn mini-btn" ${rs.length&&!state.bronzeFrozen?'':'disabled'}>${selected===rs.length?'Deselect all':'Select all records'}</button>`;head.querySelector('button').onclick=()=>{if(state.bronzeFrozen)return;const on=selected!==rs.length;rs.forEach(r=>on?state.bronzeSelected.add(key(r)):state.bronzeSelected.delete(key(r)));if(on)state.bronzeTablesSelected.add(tbl);else state.bronzeTablesSelected.delete(tbl);renderBronze();};panel.appendChild(head);if(!rs.length){panel.insertAdjacentHTML('beforeend','<div class="value-empty">No records returned for this table.</div>');return panel;}const fields=[...new Set(rs.flatMap(r=>Object.keys(r.fields||{})))];const t=document.createElement('table');t.className='record-grid';t.innerHTML='<thead><tr><th>Action</th><th>Rec#</th>'+fields.map(f=>`<th>${esc(f)}</th>`).join('')+'</tr></thead>';const b=document.createElement('tbody');rs.forEach(r=>{const row=document.createElement('tr');row.className=state.bronzeSelected.has(key(r))?'':'rec-off';const a=document.createElement('td');const cb=document.createElement('input');cb.type='checkbox';cb.disabled=state.bronzeFrozen;cb.checked=state.bronzeSelected.has(key(r));cb.onchange=e=>toggleRecord(r,e.target.checked);a.appendChild(cb);row.appendChild(a);const rec=document.createElement('td');rec.textContent=r.recnumber;row.appendChild(rec);fields.forEach(f=>{const td=document.createElement('td');td.textContent=r.fields[f]??'';row.appendChild(td)});b.appendChild(row)});t.appendChild(b);panel.appendChild(t);return panel;}
async function toSilver(){if(state.bronzeFrozen)return;const projectVersion=state.projectScopeVersion;const chosen=state.bronzeRecords.filter(r=>state.bronzeSelected.has(key(r)));try{const d=await api('/api/layers/silver',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:chosen})});if(projectVersion!==state.projectScopeVersion)return;const have=new Set(state.silverRecords.map(key));(d.records||[]).forEach(r=>{if(!have.has(key(r)))state.silverRecords.push(r)});state.bronzeSelected.clear();state.bronzeFrozen=true;setStage('silver');}catch(e){alert(e.message)}}
function renderSilver(){el.detailNodeName.textContent='Silver — validation + additions + modifications';el.detailNodeTables.textContent='Edit values, add fields, or remove records. Gold is rebuilt from the current Silver state.';el.stageActions.innerHTML=`<button class="btn btn-secondary" id="clearSilver" ${state.silverRecords.length?'':'disabled'}>Clear</button><button class="btn btn-secondary" id="addRow">+ Add row</button><button class="btn btn-primary" id="toGold" ${state.silverRecords.length?'':'disabled'}>Build Gold →</button>`;$('clearSilver').onclick=()=>{if(confirm('Clear Silver?')){state.silverRecords=[];state.bronzeFrozen=false;state.goldPayload=null;render();}};$('addRow').onclick=openAddRow;$('toGold').onclick=toGold;renderRecords(state.silverRecords,'silver');}
function renderRecords(records,mode){el.detailBody.innerHTML='';if(!records.length){el.detailBody.innerHTML='<div class="empty-state">No records in this layer.</div>';return;}const by=new Map();records.forEach(r=>{if(!by.has(r.table))by.set(r.table,[]);by.get(r.table).push(r)});by.forEach((rs,t)=>el.detailBody.appendChild(card(t,rs,mode)));}
function deleteSilverField(field,records){const name=String(field||'').trim().toUpperCase();if(!name)return;const present=records.filter(r=>Object.prototype.hasOwnProperty.call(r.fields||{},name)).length;if(!present)return;if(!confirm(`Delete field ${name} from ${present} Silver record(s)?`))return;records.forEach(r=>{if(r.fields&&Object.prototype.hasOwnProperty.call(r.fields,name))delete r.fields[name];if(Array.isArray(r.__silverAddedFields))r.__silverAddedFields=r.__silverAddedFields.filter(f=>String(f).toUpperCase()!==name);refreshStatus(r);});state.goldPayload=null;renderSilver();}
function card(table,records,mode){const card=document.createElement('div');card.className='table-card';const fields=[...new Set(records.flatMap(r=>Object.keys(r.fields||{})))];const h=document.createElement('div');h.className='table-card-head';h.innerHTML=`<span>${esc(table)}</span><span class='count'>${records.length} record(s)</span>`;card.appendChild(h);const t=document.createElement('table');t.innerHTML='<thead><tr><th>Action</th><th>Rec#</th>'+(mode==='silver'?'<th>Status</th>':'')+fields.map(f=>mode==='silver'?`<th class="silver-field-head"><span>${esc(f)}</span><button type="button" class="field-delete" title="Delete field ${esc(f)} from Silver" aria-label="Delete field ${esc(f)}">×</button></th>`:`<th>${esc(f)}</th>`).join('')+'</tr></thead>';if(mode==='silver'){t.querySelectorAll('.field-delete').forEach((btn,i)=>{btn.onclick=()=>deleteSilverField(fields[i],records);});}const body=document.createElement('tbody');records.forEach(r=>{const tr=document.createElement('tr');const a=document.createElement('td');if(mode==='bronze'){const cb=document.createElement('input');cb.type='checkbox';cb.disabled=state.bronzeFrozen;cb.checked=state.bronzeSelected.has(key(r));cb.onchange=()=>{cb.checked?state.bronzeSelected.add(key(r)):state.bronzeSelected.delete(key(r));renderBronze();};a.appendChild(cb);}else{a.innerHTML='<button class="mini">+ field</button> <button class="mini danger">×</button>';a.querySelector('.mini').onclick=()=>openAddField(r);a.querySelector('.danger').onclick=()=>{state.silverRecords=state.silverRecords.filter(x=>key(x)!==key(r));state.goldPayload=null;renderSilver();};}tr.appendChild(a);const rec=document.createElement('td');rec.textContent=r.recnumber;tr.appendChild(rec);if(mode==='silver'){const s=document.createElement('td');s.innerHTML=`<span class="status-pill ${r.status}">${esc(r.status)}</span>${r.errors?.length?`<div class="cell-error">${esc(r.errors.join('; '))}</div>`:''}${r.warnings?.length?`<div class="cell-error">${esc(r.warnings.join('; '))}</div>`:''}`;tr.appendChild(s);}fields.forEach(f=>{const td=document.createElement('td');if(mode==='silver'){const inp=document.createElement('input');inp.className='field-input';inp.value=r.fields[f]??'';inp.onchange=()=>{r.fields[f]=inp.value;state.goldPayload=null;refreshStatus(r);};td.appendChild(inp);}else td.textContent=r.fields[f]??'';tr.appendChild(td)});body.appendChild(tr)});t.appendChild(body);card.appendChild(t);return card;}
function refreshStatus(r){r.errors=[];if(!r.table)r.errors.push('Table is required');if(!r.recnumber)r.errors.push('Rec# is required');r.status=r.errors.length?'error':'validated';}
async function toGold(){const projectVersion=state.projectScopeVersion;try{const payload=await api('/api/layers/gold',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:state.silverRecords,deployClient:state.deployClient,bcsetId:state.bcsetId})});if(projectVersion!==state.projectScopeVersion)return;state.goldPayload=payload;state.goldBcsetName=state.bcsetId;setStage('gold');}catch(e){if(projectVersion===state.projectScopeVersion)alert(e.message)}}
function openGoldBcsetName(){const backdrop=$('goldBcsetBackdrop');const input=$('goldBcsetNameInput');const result=$('goldBcsetResult');input.value=state.goldBcsetName||state.bcsetId;result.textContent='';backdrop.hidden=false;input.focus();input.select();$('goldBcsetCancel').onclick=()=>{backdrop.hidden=true;};$('goldBcsetSave').onclick=()=>{const name=input.value.trim();if(!name){result.textContent='BC Set Name is required.';return;}state.goldBcsetName=name;if(state.goldPayload){state.goldPayload.DeployTableSet.forEach(t=>{t.BcsetId=name;(t.DeployRowSet||[]).forEach(r=>{r.BcsetId=name;(r.DeployFieldSet||[]).forEach(f=>{f.BcsetId=name;});});});}state.deploymentVersions=[];backdrop.hidden=true;render();}}
async function renderGold(){
  el.detailNodeName.textContent='Gold — deploy-ready';
  el.detailNodeTables.textContent=state.goldPayload?`Target client ${state.goldPayload.targetClient} · ${state.goldPayload.recordCount} record(s) · ${state.goldPayload.valueCount} field value(s)${state.admin.selectedProject?'':' · Select a project before deployment'}`:'Build Gold from Silver first.';
  const can=!!state.goldPayload&&state.deployConfigured&&!!state.admin.selectedProject;
  el.stageActions.innerHTML=`<button class="btn btn-secondary" id="goldBcsetNameBtn">BC Set Name</button><button class="btn btn-secondary" id="refreshVersionsBtn">Versions</button><button class="btn btn-danger" id="deployBtn" ${can?'':'disabled'}>Deploy to Target</button>`;
  $('goldBcsetNameBtn').onclick=openGoldBcsetName;
  $('deployBtn').onclick=openDeploy;
  $('refreshVersionsBtn').onclick=()=>loadDeploymentVersions(true);
  el.detailBody.innerHTML='';
  if(!state.goldPayload){el.detailBody.innerHTML='<div class="empty-state">Nothing in Gold yet.</div>';return;}
  const history=document.createElement('div');history.className='gold-block';history.innerHTML='<h4>Gold Deployment Versions</h4><div id="deploymentVersionList" class="deployment-version-list">Loading versions…</div>';el.detailBody.appendChild(history);
  state.goldPayload.DeployTableSet.forEach(x=>{const b=document.createElement('div');b.className='gold-block';b.innerHTML=`<h4>${esc(x.Tablename)} · ${x.DeployRowSet.length} record(s)</h4><pre>${esc(JSON.stringify(x,null,2))}</pre>`;el.detailBody.appendChild(b)});
  await loadDeploymentVersions(false);
}
async function loadDeploymentVersions(force){
  if(!state.goldPayload)return;
  const box=$('deploymentVersionList');
  if(!box)return;
  try{
    const projectId=state.admin.selectedProject?.project_id||'';
    const q=`?projectId=${encodeURIComponent(projectId)}&bcsetId=${encodeURIComponent(state.goldBcsetName||state.bcsetId)}&targetClient=${encodeURIComponent(state.goldPayload.targetClient)}`;
    const d=await api('/api/deploy/versions'+q,{},8000);
    state.deploymentVersions=d.versions||[];
    if(!state.deploymentVersions.length){box.innerHTML='<span class="modal-note">No deployment versions recorded yet.</span>';return;}
    box.innerHTML=state.deploymentVersions.map(v=>`<div class="deployment-version-row"><b>v${esc(String(v.version))}</b><span>${esc(String(v.status||'DEPLOYED'))}</span><span>${esc(new Date(v.deployed_at||'').toLocaleString())}</span><span>${esc(String(v.record_count||0))} records · ${esc(String(v.value_count||0))} fields</span>${v.overwrite_of_version?`<span>overwrote v${esc(String(v.overwrite_of_version))}</span>`:''}</div>`).join('');
  }catch(e){box.innerHTML=`<span class="error-state">${esc(e.message)}</span>`;}
}
let addTarget=null;
let addFieldOptions=[];
let selectedAddField='';
async function openAddField(r){
  addTarget=r;
  selectedAddField='';
  el.newFieldValue.value='';
  el.addFieldResult.textContent='';
  el.addFieldConfirm.disabled=true;
  el.fieldSearch.value='';
  el.selectedFieldInfo.textContent=`Loading fields for ${String(r.table||'').toUpperCase()}…`;
  el.fieldList.innerHTML='<div class="field-picker-empty">Loading fields from SAP…</div>';
  el.addFieldBackdrop.hidden=false;
  try{
    const d=await api(`/api/table-fields?table=${encodeURIComponent(String(r.table||''))}`);
    const existing=new Set(Object.keys(r.fields||{}).map(x=>String(x).toUpperCase()));
    addFieldOptions=(d.fields||[]).map(f=>({...f,alreadyExists:existing.has(String(f.fieldName||'').toUpperCase())}));
    renderFieldPicker();
    el.fieldSearch.focus();
  }catch(e){
    addFieldOptions=[];
    el.fieldList.innerHTML=`<div class="field-picker-empty">${esc(e.message)}</div>`;
    el.selectedFieldInfo.textContent='Field list unavailable.';
  }
}
function renderFieldPicker(){
  const q=String(el.fieldSearch.value||'').trim().toUpperCase();
  const rows=addFieldOptions.filter(f=>!q||String(f.fieldName||'').toUpperCase().includes(q)||String(f.description||'').toUpperCase().includes(q));
  el.fieldList.innerHTML='';
  if(!rows.length){
    el.fieldList.innerHTML='<div class="field-picker-empty">No matching fields.</div>';
    return;
  }
  rows.forEach(f=>{
    const row=document.createElement('label');
    row.className='field-picker-row'+(f.alreadyExists?' disabled':'');
    const cb=document.createElement('input');
    cb.type='radio';
    cb.name='silverFieldChoice';
    cb.disabled=Boolean(f.alreadyExists);
    cb.checked=String(f.fieldName||'').toUpperCase()===selectedAddField;
    cb.onchange=()=>{
      if(cb.disabled)return;
      selectedAddField=String(f.fieldName||'').toUpperCase();
      el.selectedFieldInfo.textContent=`Selected: ${selectedAddField}${f.key?' · DDIC key field':''}${f.dataType?` · ${f.dataType}`:''}${f.length?` · Length ${f.length}`:''}`;
      el.addFieldConfirm.disabled=false;
    };
    const name=document.createElement('span');name.className='field-picker-name';name.textContent=String(f.fieldName||'').toUpperCase();
    const desc=document.createElement('span');desc.className='field-picker-desc';desc.textContent=`${f.description||'SAP field'}${f.dataType?` · ${f.dataType}`:''}${f.length?` · ${f.length}`:''}${f.decimals?` · Dec ${f.decimals}`:''}`;
    row.append(cb,name,desc);
    if(f.key){const k=document.createElement('span');k.className='field-picker-key';k.textContent='KEY';row.appendChild(k);}
    if(f.alreadyExists){const e=document.createElement('span');e.className='field-picker-key';e.textContent='EXISTS';row.appendChild(e);}
    el.fieldList.appendChild(row);
  });
}
el.fieldSearch.oninput=renderFieldPicker;
el.addFieldCancel.onclick=()=>{el.addFieldBackdrop.hidden=true;addTarget=null;selectedAddField='';};
el.addFieldConfirm.onclick=()=>{
  const n=String(selectedAddField||'').trim().toUpperCase();
  if(!n){el.addFieldResult.textContent='Select a field';return;}
  if(!addTarget||Object.prototype.hasOwnProperty.call(addTarget.fields||{},n)){el.addFieldResult.textContent='Field already exists';return;}
  addTarget.fields[n]=el.newFieldValue.value;
  addTarget.__silverAddedFields=Array.isArray(addTarget.__silverAddedFields)?addTarget.__silverAddedFields:[];
  if(!addTarget.__silverAddedFields.includes(n))addTarget.__silverAddedFields.push(n);
  refreshStatus(addTarget);
  state.goldPayload=null;
  el.addFieldBackdrop.hidden=true;
  addTarget=null;
  selectedAddField='';
  renderSilver();
};
let addRowKeyInputs=[];function openAddRow(){const nodeTables=state.selectedNode?tables(state.selectedNode):[];const existingTables=[...new Set(state.silverRecords.map(r=>String(r.table||'').toUpperCase()))];const options=[...new Set([...nodeTables,...existingTables])].sort();el.newRowTable.innerHTML=options.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');el.newRowRecnumber.value='';el.addRowResult.textContent='';renderAddRowKeys();el.newRowTable.onchange=renderAddRowKeys;el.addRowBackdrop.hidden=false;el.newRowRecnumber.focus();}function renderAddRowKeys(){const table=String(el.newRowTable.value||'').toUpperCase();const names=String(tableMeta.get(table)?.key||'').split(',').map(x=>x.trim().toUpperCase()).filter(x=>x&&x!=='MANDT'&&x!=='SPRAS');addRowKeyInputs=[];el.newRowKeyFields.innerHTML='';if(!names.length){el.newRowKeyFields.innerHTML='<div class="modal-note">No configured DDIC key fields for this table. Use + field after adding the row to enter deployment values.</div>';return;}const title=document.createElement('div');title.className='modal-note';title.textContent='DDIC key fields (values are used to derive the target E071K TABKEY).';el.newRowKeyFields.appendChild(title);names.forEach(name=>{const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.className='modal-input';input.placeholder=name+' value';label.appendChild(input);el.newRowKeyFields.appendChild(label);addRowKeyInputs.push({name,input});});}el.addRowCancel.onclick=()=>el.addRowBackdrop.hidden=true;el.addRowConfirm.onclick=()=>{const table=String(el.newRowTable.value||'').trim().toUpperCase();const rec=String(el.newRowRecnumber.value||'').trim();if(!table){el.addRowResult.textContent='Table is required';return;}if(!rec){el.addRowResult.textContent='Rec# is required';return;}if(state.silverRecords.some(r=>String(r.table||'').toUpperCase()===table&&String(r.recnumber||'').trim()===rec)){el.addRowResult.textContent='A Silver row with this Table + Rec# already exists';return;}const fields={};addRowKeyInputs.forEach(x=>{fields[x.name]=x.input.value;});const row={table,recnumber:rec,sourceRecnumber:'',sourceTableName:table,rawTableKey:'',fields};refreshStatus(row);state.silverRecords.push(row);state.goldPayload=null;el.addRowBackdrop.hidden=true;renderSilver();};
async function openDeploy(){
  el.deployResult.textContent='';el.deployResult.className='';
  state.deploymentCheck=null;
  el.deployModalBody.innerHTML='<div class="loading-state">Checking the latest deployed Gold version field-by-field…</div>';
  el.deployModalBackdrop.hidden=false;
  try{
    const d=await api('/api/deploy/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      projectId:state.admin.selectedProject?.project_id||null,
      bcsetId:state.goldBcsetName||state.bcsetId,targetClient:state.goldPayload.targetClient,
      DeployTableSet:state.goldPayload.DeployTableSet
    })},10000);
    state.deploymentCheck=d;
    const latest=d.latest;
    let status='';
    if(d.alreadyDeployed){
      status=`<div class="deploy-existing-warning"><b>Already deployed.</b> This Gold payload is identical to version ${esc(String(latest?.version||''))} field-by-field.</div>
      <label class="master-select overwrite-option"><input id="deployOverwrite" type="checkbox"> <span>Already deployed, want to overwrite it</span></label>`;
    }else if(latest){
      const diff=d.diff||{};
      status=`<div class="deploy-change-summary"><b>New deployment detected.</b> Latest version: ${esc(String(latest.version))}. ${esc(String(diff.changedFieldCount||0))} field-level difference(s).</div>`;
    }else{
      status='<div class="deploy-change-summary"><b>First deployment for this project / BC Set / target client.</b> This will be version 1.</div>';
    }
    const diff=d.diff||{};
    const diffRows=[...(diff.added||[]).map(x=>({...x,type:'Added'})),...(diff.changed||[]).map(x=>({...x,type:'Changed'})),...(diff.removed||[]).map(x=>({...x,type:'Removed'}))].slice(0,100);
    const diffHtml=diffRows.length?`<div class="deploy-diff"><b>Field-level comparison</b><table><thead><tr><th>Change</th><th>Table</th><th>Rec#</th><th>Field</th><th>Previous</th><th>Current</th></tr></thead><tbody>${diffRows.map(x=>`<tr><td>${esc(x.type)}</td><td>${esc(x.table)}</td><td>${esc(x.recnumber)}</td><td>${esc(x.field)}</td><td>${esc(x.before??'')}</td><td>${esc(x.after??'')}</td></tr>`).join('')}</tbody></table></div>`:'';
    el.deployModalBody.innerHTML=`<div class="deploy-summary"><b>${esc(state.goldBcsetName||state.bcsetId)}</b>${state.goldBcsetName!==state.bcsetId?`<br>Source BC Set: ${esc(state.bcsetId)}`:''}<br>Next version: <b>${esc(String(d.version||1))}</b> · ${state.goldPayload.DeployTableSet.length} table(s) · ${state.goldPayload.recordCount} record(s) · ${state.goldPayload.valueCount} value(s)</div>${status}${diffHtml}<details><summary>Gold payload</summary><pre>${esc(JSON.stringify(state.goldPayload,null,2))}</pre></details>`;
    const cb=$('deployActivate');const btn=el.deployConfirmBtn;const sync=()=>{btn.textContent=cb&&cb.checked?'Stage & Activate':'Stage only';};
    if(cb)cb.onchange=sync;sync();
    const overwrite=$('deployOverwrite');
    if(overwrite)overwrite.onchange=()=>{el.deployConfirmBtn.disabled=d.alreadyDeployed&&!overwrite.checked;};
    el.deployConfirmBtn.disabled=Boolean(d.alreadyDeployed);
  }catch(e){
    el.deployResult.className='err';el.deployResult.textContent='Deployment pre-check failed\\n'+e.message;el.deployConfirmBtn.disabled=true;
  }
}
el.deployCancelBtn.onclick=()=>el.deployModalBackdrop.hidden=true;
el.deployConfirmBtn.onclick=async()=>{
  el.deployConfirmBtn.disabled=true;el.deployResult.textContent='Deploying…';
  const activate=!!$('deployActivate')?.checked;
  const overwrite=!!$('deployOverwrite')?.checked;
  const action=activate?'Stage + Activate':'Stage only';
  try{
    const d=await api('/api/deploy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      projectId:state.admin.selectedProject?.project_id||null,bcsetId:state.bcsetId,goldBcsetName:state.goldBcsetName||state.bcsetId,targetClient:state.goldPayload.targetClient,activate,overwrite,
      DeployTableSet:state.goldPayload.DeployTableSet
    })});
    el.deployResult.className='ok';
    el.deployResult.textContent=`${action} successful · Gold version ${d.deploymentVersion||'not persisted'}\n`+JSON.stringify(d.result,null,2);
    await loadAuditLogs().catch(()=>{});
  }catch(e){el.deployResult.className='err';el.deployResult.textContent=action+' failed\\n'+e.message;}
  finally{el.deployConfirmBtn.disabled=false;}
};

// ---------------------------------------------------------------------------
// Three-panel workspace resizing
// ---------------------------------------------------------------------------
function initWorkspacePanelResizing(){
  const layout=document.querySelector('.layout');
  const handles=[...document.querySelectorAll('.workspace-resize-handle')];
  if(!layout || handles.length!==2)return;

  const STORAGE_KEY='iconfigpro.workspace.panelWidths.v88';
  const MIN_LEFT=240, MIN_MIDDLE=280, MIN_RIGHT=320, HANDLE_TOTAL=12;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function availableWidth(){
    return Math.max(0, layout.clientWidth-HANDLE_TOTAL);
  }

  function applyWidths(left,middle,save=true){
    const total=availableWidth();
    const maxLeft=Math.max(MIN_LEFT,total-MIN_MIDDLE-MIN_RIGHT);
    const nextLeft=clamp(Math.round(left),MIN_LEFT,maxLeft);
    const remaining=total-nextLeft;
    const maxMiddle=Math.max(MIN_MIDDLE,remaining-MIN_RIGHT);
    const nextMiddle=clamp(Math.round(middle),MIN_MIDDLE,maxMiddle);
    layout.style.setProperty('--left-panel-width',`${nextLeft}px`);
    layout.style.setProperty('--middle-panel-width',`${nextMiddle}px`);
    if(save){
      try{
        localStorage.setItem(STORAGE_KEY,JSON.stringify({left:nextLeft,middle:nextMiddle}));
      }catch(_e){}
    }
  }

  function currentWidths(){
    const cs=getComputedStyle(layout);
    return {
      left:parseFloat(cs.getPropertyValue('--left-panel-width'))||280,
      middle:parseFloat(cs.getPropertyValue('--middle-panel-width'))||360
    };
  }

  function startDrag(handle,event){
    if(event.button!==undefined && event.button!==0)return;
    event.preventDefault();
    const startX=event.clientX;
    const start=currentWidths();
    const type=handle.dataset.resizeHandle;
    handle.classList.add('active');
    document.body.classList.add('workspace-resizing');
    document.body.style.userSelect='none';
    document.body.style.cursor='col-resize';

    const move=ev=>{
      const dx=ev.clientX-startX;
      if(type==='left') applyWidths(start.left+dx,start.middle);
      else applyWidths(start.left,start.middle+dx);
    };
    const end=()=>{
      handle.classList.remove('active');
      document.body.classList.remove('workspace-resizing');
      document.body.style.userSelect='';
      document.body.style.cursor='';
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
  }

  handles.forEach(handle=>{
    handle.addEventListener('pointerdown',e=>startDrag(handle,e));
    handle.addEventListener('keydown',e=>{
      if(e.key!=='ArrowLeft' && e.key!=='ArrowRight')return;
      e.preventDefault();
      const w=currentWidths();
      const delta=e.key==='ArrowRight'?20:-20;
      if(handle.dataset.resizeHandle==='left') applyWidths(w.left+delta,w.middle);
      else applyWidths(w.left,w.middle+delta);
    });
  });

  window.addEventListener('resize',()=>{
    const w=currentWidths();
    applyWidths(w.left,w.middle,false);
  });

  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(_e){}
  applyWidths(Number.isFinite(saved?.left)?saved.left:280,
              Number.isFinite(saved?.middle)?saved.middle:360,false);
}

initWorkspacePanelResizing();
init();
$('tablesModalCloseBtn').onclick=closeTablesModal;
$('tablesModalCloseTop').onclick=closeTablesModal;
$('tablesModalBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeTablesModal();});
})();
