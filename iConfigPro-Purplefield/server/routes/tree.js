const express = require('express');
const tree = require('../../data/processDirectoryTree.json');
const sproTree = require('../../data/sproImgL1L6.json');
const { mode, fetchSproHierarchy } = require('../sapClient');
const supabaseAdmin = require('../supabaseAdmin');
const { CATALOG, codeFor, definitionFor, hierarchyAliasesFor, normalize: normalizeSproModule } = require('../sproModules');

const router = express.Router();

const nodeIndex = {};
(function index(nodes) {
    (nodes || []).forEach((n) => {
        nodeIndex[n.id] = n;
        index(n.children);
    });
})(tree);
(function indexSpro(nodes) {
    (nodes || []).forEach((n) => {
        nodeIndex[n.id] = n;
        indexSpro(n.children);
    });
})(sproTree);

const clean = (v) => String(v ?? '').replace(/\u00a0/g, ' ').trim();
const upper = (v) => clean(v).toUpperCase();

function prop(row, names) {
    const keys = Object.keys(row || {});
    const exact = new Map(keys.map((k) => [k.toLowerCase(), k]));
    for (const name of names) {
        const hit = exact.get(String(name).toLowerCase());
        if (hit) return row[hit];
    }
    return '';
}

function flattenStatic(nodes, out = []) {
    (nodes || []).forEach((n) => {
        out.push(n);
        flattenStatic(n.children, out);
    });
    return out;
}

const staticNodes = flattenStatic(sproTree);

// Canonicalize table scope at the server boundary. The legacy catalog contains
// one combined display value "VTFA / VTFL", but these are two physical SAP
// tables and must remain separate for counts, extraction, and matching.
function normalizeTableScope(values) {
    const out = new Set();
    (values || []).forEach((value) => {
        String(value ?? '')
            .split(/\s+\/\s+|\s*[,;]\s*/)
            .map((part) => upper(part))
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((part) => out.add(part));
    });
    return [...out];
}

const staticTables = new Set();
staticNodes.forEach((n) => normalizeTableScope(n.tables).forEach((t) => staticTables.add(t)));

// SPRO's hierarchy is an ordered tree, not an alphabetical list. When the
// runtime OData payload contains BROTHER_ID we preserve that SAP sibling chain
// below. For older/custom services that do not expose BROTHER_ID, use the
// documented Enterprise Structure order as a deterministic compatibility
// fallback. Unknown nodes retain their source order after the known entries.
function looksLikePhysicalTable(value) {
    const candidate = upper(value);
    return /^[A-Z0-9_\/<>]+$/.test(candidate) && candidate.length >= 3;
}

function collectTablesForSapNode(row) {
    const tableName = clean(prop(row, [
        'TableName', 'TABLENAME', 'Tablename'
    ]));
    const objectName = clean(prop(row, [
        'ObjectName', 'OBJECTNAME', 'Objectname'
    ]));
    const objectType = upper(prop(row, [
        'ObjectType', 'OBJECTTYPE', 'Objecttype'
    ]));
    const isTable = upper(prop(row, [
        'IsTable', 'IS_TABLE', 'Istable'
    ])) === 'X' || isTableBoolean(prop(row, [
        'IsTable', 'IS_TABLE', 'Istable'
    ]));

    const refs = [
        prop(row, ['ReferenceObject', 'REF_OBJECT', 'Referenceobject', 'CustomizingObject']),
        prop(row, ['Activity', 'ACTIVITY']),
        prop(row, ['CustomizingActivity', 'CUSTOMIZING_ACTIVITY']),
        prop(row, ['Transaction', 'TRANSACTION']),
        prop(row, ['NodeText', 'NODE_TEXT', 'Text']),
        prop(row, ['TreeText', 'TREE_TEXT'])
    ].map(clean).filter(Boolean);
    const haystack = upper(refs.join(' '));
    const result = new Set();

    // ------------------------------------------------------------
    // 1. Authoritative runtime table metadata, when supplied by SAP.
    // ------------------------------------------------------------
    if (tableName && (isTable || looksLikePhysicalTable(tableName))) {
        result.add(upper(tableName));
    }

    // If the runtime identifies the object as a table, ObjectName is also
    // a valid physical-table source. Do not treat arbitrary COBJ/ACTI names
    // as tables.
    if (objectName && objectType === 'TABL' && looksLikePhysicalTable(objectName)) {
        result.add(upper(objectName));
    }

    // ------------------------------------------------------------
    // 2. Explicit reference/customizing object when it is a known
    //    physical table from the catalog.
    // ------------------------------------------------------------
    refs.forEach((ref) => {
        const candidate = upper(ref);
        if (staticTables.has(candidate)) result.add(candidate);
    });

    // ------------------------------------------------------------
    // 3. Existing T-table catalog bridge.
    //    This remains a mapping/catalog only; it is NOT the hierarchy.
    // ------------------------------------------------------------
    staticNodes.forEach((n) => {
        const name = upper(n.name);
        if (!name || !haystack.includes(name)) return;
        normalizeTableScope(n.tables).forEach((t) => result.add(t));
    });

    // ------------------------------------------------------------
    // 4. Capture physical table tokens explicitly present in SAP text.
    // ------------------------------------------------------------
    for (const table of staticTables) {
        if (haystack.includes(table)) result.add(table);
    }

    return [...result];
}

function isTableBoolean(value) {
    if (value === true || value === 1) return true;
    const text = upper(value);
    return text === 'TRUE' || text === '1' || text === 'YES';
}

function dedupeSapHierarchyRows(rows){
    const byKey=new Map();
    (rows||[]).forEach((row)=>{
        const treeId=clean(prop(row,['TreeId','TREE_ID','TreeID']));
        const nodeId=clean(prop(row,['NodeId','NODE_ID','NodeID']));
        const key=`${treeId}#${nodeId}`;
        if(!treeId || !nodeId){
            const fallback=`#${byKey.size}`;
            byKey.set(fallback,row);
            return;
        }
        const existing=byKey.get(key);
        if(!existing){
            byKey.set(key,row);
            return;
        }
        // Keep the first structural identity (TreeId/NodeId/ParentNodeId)
        // and fill missing descriptive fields from a repeated SAP row.
        Object.keys(row||{}).forEach((field)=>{
            const current=existing[field];
            if((current===undefined || current===null || String(current).trim()==='') && row[field]!==undefined && row[field]!==null){
                existing[field]=row[field];
            }
        });
    });
    return [...byKey.values()];
}

function buildSapTree(rows, moduleName) {
    const sourceRows = dedupeSapHierarchyRows(rows);
    const records = sourceRows.map((row, index) => {
        const treeId = clean(prop(row, ['TreeId', 'TREE_ID', 'TreeID']));
        const nodeId = clean(prop(row, ['NodeId', 'NODE_ID', 'NodeID']));
        const parentId = clean(prop(row, ['ParentNodeId', 'PARENT_ID', 'ParentId', 'PARENT_NODE_ID']));
        const levelRaw = clean(prop(row, ['NodeLevel', 'NODE_LEVEL', 'Level']));
        const level = Number.parseInt(levelRaw, 10) || 1;
        const nodeText = clean(prop(row, ['NodeText', 'NODE_TEXT', 'NodeTextValue', 'Text']));
        const treeText = clean(prop(row, ['TreeText', 'TREE_TEXT']));
        const nodeType = clean(prop(row, ['NodeType', 'NODE_TYPE']));
        const activity = clean(prop(row, ['Activity', 'ACTIVITY']));
        const refType = clean(prop(row, ['ReferenceType', 'REF_TYPE']));
        const refObject = clean(prop(row, ['ReferenceObject', 'REF_OBJECT']));
        const customizingObject = clean(prop(row, ['CustomizingObject', 'CUSTOMIZING_OBJECT'])) || refObject;
        const brotherId = clean(prop(row, ['BrotherId', 'BROTHER_ID', 'BrotherID']));
        const sequenceRaw = clean(prop(row, ['SequenceNo', 'SEQUENCE_NO', 'Sequence', 'SEQ', 'R_SEQUEN']));
        const sequenceNo = Number.parseInt(sequenceRaw, 10) || 0;
        const refNodeId = clean(prop(row, ['RefNodeId', 'REFNODE_ID']));
        const refTreeId = clean(prop(row, ['RefTreeId', 'REFTREE_ID']));
        const stableNodeId = nodeId || `${treeId || 'tree'}-${index}`;
        return {
            id: `sap-${treeId || 'tree'}-${stableNodeId}`,
            _treeId: treeId,
            _nodeId: stableNodeId,
            _parentId: parentId,
            _brotherId: brotherId,
            _sequenceNo: sequenceNo,
            _refNodeId: refNodeId,
            _refTreeId: refTreeId,
            level,
            name: nodeText || treeText || activity || stableNodeId,
            module_name: moduleName,
            activity,
            tree_id: treeId,
            node_id: stableNodeId,
            parent_node_id: parentId,
            node_type: nodeType,
            tree_text: treeText,
            node_text: nodeText,
            reference_type: refType,
            reference_object: refObject,
            customizing_object: customizingObject,
            tables: normalizeTableScope(collectTablesForSapNode(row)),
            sequence_no: sequenceNo,
            brother_id: brotherId,
            children: []
        };
    });

    // Build parent/child relationships from the SAP relationship itself.
    // parent_node_id -> node_id is authoritative. Never attach a node merely
    // because it has a particular level, appears after another node, or has
    // the same module/tree name.
    const byTreeAndNode = new Map();
    const byNodeId = new Map();

    records.forEach((r) => {
        byTreeAndNode.set(`${r._treeId}#${r._nodeId}`, r);

        // node_id is normally unique inside one returned hierarchy. Keep the
        // first occurrence as a safe fallback for payloads where TreeId is
        // omitted on a child row but ParentNodeId is still valid.
        if (!byNodeId.has(r._nodeId)) byNodeId.set(r._nodeId, r);
    });

    const roots = [];
    records.forEach((r) => {
        const parentId = clean(r._parentId);
        let parent = null;

        if (parentId && parentId !== r._nodeId) {
            parent = byTreeAndNode.get(`${r._treeId}#${parentId}`) || byNodeId.get(parentId);
        }

        if (parent && parent !== r) {
            parent.children.push(r);
        } else {
            roots.push(r);
        }
    });

    // Preserve SAP sibling order when the FM exposes BROTHER_ID. Otherwise
    // retain the service's returned order.
    const sortSiblings = (nodes) => {
        const hasSequence = nodes.some((n) => Number.isFinite(n._sequenceNo) && n._sequenceNo > 0);
        if (hasSequence) {
            nodes.sort((a, b) => (a._sequenceNo || Number.MAX_SAFE_INTEGER) - (b._sequenceNo || Number.MAX_SAFE_INTEGER));
        }

        const map = new Map(nodes.map((n) => [n._nodeId, n]));
        const childIds = new Set(nodes.map((n) => n._nodeId));
        const hasBrotherChain = !hasSequence && nodes.some((n) => n._brotherId && childIds.has(n._brotherId));
        if (hasBrotherChain) {
            const referenced = new Set(nodes.map((n) => n._brotherId).filter((x) => childIds.has(x)));
            const first = nodes.find((n) => !referenced.has(n._nodeId));
            if (first) {
                const ordered = [];
                const seen = new Set();
                let cur = first;
                while (cur && !seen.has(cur._nodeId)) {
                    ordered.push(cur); seen.add(cur._nodeId);
                    cur = map.get(cur._brotherId);
                }
                nodes.splice(0, nodes.length, ...ordered, ...nodes.filter((n) => !seen.has(n._nodeId)));
            }
        }
        nodes.forEach((n) => sortSiblings(n.children));
    };
    sortSiblings(roots);


    // ------------------------------------------------------------
    // Propagate descendant T-table scope upward through the runtime
    // hierarchy. A valid SAP IMG container node (L1-L5) may have no
    // direct TableName of its own while its descendant IMG activity
    // nodes do. Bronze selection must therefore see the descendant
    // tables without inventing a static hierarchy.
    // ------------------------------------------------------------
    const collectDescendantTables = (node) => {
        const tables = new Set(normalizeTableScope(node.tables));
        (node.children || []).forEach((child) => {
            collectDescendantTables(child).forEach((table) => tables.add(table));
        });
        node.tables = [...tables];
        return tables;
    };
    roots.forEach(collectDescendantTables);

    // The UI only needs the SAP hierarchy fields and T-table association.
    // Internal traversal fields are removed before returning JSON.
    const strip = (n) => {
        n.children.forEach(strip);
        delete n._treeId; delete n._nodeId; delete n._parentId; delete n._brotherId;
        delete n._refNodeId; delete n._refTreeId; delete n._sequenceNo;
    };
    roots.forEach(strip);
    return roots;
}


function flattenOrderedTree(nodes, language='E', out=[], sourceSystem='ODATA'){
    (nodes || []).forEach((node, index) => {
        const parent = node.parent_node_id || null;
        // Persist the SAP SequenceNo. Do not recalculate it from the array
        // index: sequence_no is SAP's sibling ordering contract.
        const sequenceNo = Number(node._sequenceNo ?? node.sequence_no ?? 0) || (index + 1);
        out.push({
            module_name: node.module_name,
            language,
            tree_id: node.tree_id || '',
            node_id: node.node_id || '',
            parent_node_id: parent,
            brother_id: node.brother_id || node._brotherId || null,
            level_no: Number(node.level || 1),
            sequence_no: sequenceNo,
            node_name: node.name || '',
            node_text: node.node_text || null,
            tree_text: node.tree_text || null,
            node_type: node.node_type || null,
            activity: node.activity || null,
            reference_type: node.reference_type || null,
            reference_object: node.reference_object || null,
            customizing_object: node.customizing_object || null,
            table_name: Array.isArray(node.tables) ? node.tables.join(',') : null,
            source_system:sourceSystem
        });
        flattenOrderedTree(node.children, language, out, sourceSystem);
    });
    return out;
}

function mergeSameNamedRoots(roots){
    const out=[];
    const byName=new Map();
    (roots||[]).forEach(root=>{
        const key=upper(root?.name||'');
        if(!key){ out.push(root); return; }
        const existing=byName.get(key);
        if(!existing){
            byName.set(key,root);
            out.push(root);
            return;
        }
        const tablesSet=new Set([...(existing.tables||[]),...(root.tables||[])]);
        existing.tables=[...tablesSet];
        const existingIds=new Set((existing.children||[]).map(c=>String(c.id||'')));
        (root.children||[]).forEach(child=>{
            if(!existingIds.has(String(child.id||''))){
                existing.children.push(child);
                existingIds.add(String(child.id||''));
            }
        });
    });
    return out;
}


function buildCachedRows(rows, moduleName){
    const mapped=dedupeSapHierarchyRows((rows||[]).map((row,index)=>({
        TreeId:row.tree_id,
        NodeId:row.node_id,
        ParentNodeId:row.parent_node_id,
        BrotherId:row.brother_id,
        SequenceNo:row.sequence_no,
        NodeLevel:row.level_no,
        NodeText:row.node_text || row.node_name,
        TreeText:row.tree_text || '',
        NodeType:row.node_type || '',
        Activity:row.activity || '',
        ReferenceType:row.reference_type || '',
        ReferenceObject:row.reference_object || '',
        CustomizingObject:row.customizing_object || '',
        TableName:row.table_name || '',
        module_code:row.module_code || codeFor(moduleName) || '',
        _cacheIndex:index
    })));
    const built=buildSapTree(mapped,moduleName);
    // Legacy SAP IMG cache representation can contain the same selected
    // module branch twice (for example under Definition and Assignment) in
    // the Enterprise Structure tree. For a project module, those branches
    // represent one logical L1 module and must be merged, while preserving
    // every descendant and table association.
    return mergeSameNamedRoots(built);
}

async function loadSproHierarchy(moduleCodeOrName, language, forceRefresh=false){
    const requested=normalizeSproModule(moduleCodeOrName);
    const definition=definitionFor(requested);
    const moduleCode=definition?.code || codeFor(requested) || requested;
    const moduleName=definition?.name || requested;
    const canUseSupabase=supabaseAdmin.configured();

    // Agreed runtime policy:
    //   1. Project assignment comes from Supabase.
    //   2. For each assigned module, check Supabase hierarchy first.
    //   3. If valid hierarchy rows exist, use them and DO NOT call OData.
    //   4. If there are zero rows, call SAP OData, persist the result, then use it.
    //   5. refresh=1 is an explicit Refresh Source operation and bypasses cache.
    //   6. Static JSON is never a runtime hierarchy source.
    if(canUseSupabase && !forceRefresh){
        const cached=await supabaseAdmin.listSproHierarchy(moduleCode,language);
        if(cached.length){
            const cachedTree=buildCachedRows(cached,moduleName);
            if(cachedTree.length){
                return {tree:cachedTree.map(root=>({...root,module_code:moduleCode})),source:'SUPABASE'};
            }
            // Rows exist but cannot form a tree: this is data integrity/tree
            // construction failure, NOT an empty cache. Do not silently call
            // OData or static JSON; surface the condition to the caller.
            throw new Error(`Supabase contains ${cached.length} L1-L6 row(s) for module ${moduleCode}, but they could not be assembled into a valid hierarchy tree.`);
        }
    }

    if(mode === 'mock'){
        // Mock mode is only for local demo/test environments where Supabase is
        // intentionally not configured. It is not used as a production cache.
        const names=new Set(hierarchyAliasesFor(moduleCode).map(upper));
        const mockTree=sproTree.filter((n) => names.has(upper(n.module_name)));
        return {tree:mockTree.map(root=>({...root,module_code:moduleCode})),source:'MOCK'};
    }

    // No valid Supabase hierarchy exists for this module (or the caller
    // explicitly requested Refresh Source). Only now call SAP OData.
    const candidates=[moduleName,...hierarchyAliasesFor(moduleCode).filter(x=>upper(x)!==upper(moduleName))];
    let rows=[];
    let sapError=null;
    for(const candidate of candidates){
        try{
            rows=await fetchSproHierarchy(candidate,language);
            if(rows.length)break;
        }catch(e){
            sapError=e;
        }
    }
    if(!rows.length){
        if(sapError) throw sapError;
        return {tree:[],source:'ODATA-EMPTY'};
    }

    let built=buildSapTree(rows,moduleName).map(root=>({...root,module_code:moduleCode}));
    if(!built.length){
        throw new Error(`SAP OData returned rows for module ${moduleCode}, but they could not be assembled into a valid L1-L6 hierarchy tree.`);
    }

    const source='ODATA';

    if(canUseSupabase){
        const flattened=flattenOrderedTree(built,language,[],source);
        const stored=await supabaseAdmin.replaceSproHierarchy(flattened);
        if(!stored.length){
            throw new Error(`SAP OData returned a hierarchy for ${moduleCode}, but it could not be persisted to Supabase.`);
        }
    }

    return {tree:built,source};
}

router.get('/', (req, res) => res.json(tree));

router.get('/spro', async (req, res) => {
    const requestedModule = clean(req.query.moduleCode || req.query.module || req.query.moduleName || '');
    const language = clean(req.query.language || 'E') || 'E';
    const forceRefresh = ['1','true','x'].includes(String(req.query.refresh || '').trim().toLowerCase());

    if (!requestedModule) {
        if (mode === 'mock') return res.json(sproTree);
        res.status(400).json({ error: 'SAP SPRO module is required.' });
        return;
    }

    try {
        const result = await loadSproHierarchy(requestedModule, language, forceRefresh);
        res.set('X-SPRO-Hierarchy-Source', result.source);
        res.json(result.tree);
    } catch (e) {
        // A real Supabase/OData/tree-integrity error is not the same as an
        // empty cache. Return the diagnostic to the caller so the UI cannot
        // silently report "No L1-L6 hierarchy data" when the source query
        // actually failed.
        const status = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500;
        res.set('X-SPRO-Hierarchy-Source', 'ERROR');
        res.status(status).json({ error: String(e.message || 'Hierarchy unavailable') });
    }
});

router.get('/:nodeId', (req, res) => {
    const node = nodeIndex[req.params.nodeId];
    if (!node) {
        res.status(404).json({ error: `Unknown node id "${req.params.nodeId}".` });
        return;
    }
    res.json(node);
});

module.exports = { router, nodeIndex };
