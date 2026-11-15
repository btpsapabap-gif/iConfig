# iConfigPro V89 — SAP SPRO Hierarchy Source Fix

## Root cause
The previous runtime still supported a legacy path that read the Enterprise
Structure hierarchy and extracted/re-rooted a selected module branch. That is
not the SAP module hierarchy. It can produce a small branch (for example
8 rows for Logistics - General) instead of the complete SAP hierarchy.

## Fix
- Removed Enterprise Structure branch extraction from the runtime cache lookup.
- A module cache is accepted only when it is a complete SAP-rooted hierarchy.
- The cache root must have:
  - level 1
  - no parent
  - node_id = tree_id + `_T`
- All rows must belong to the same tree and all parent_node_id values must
  resolve within that tree.
- If the cache is empty or structurally stale, the application calls the
  module's SAP OData hierarchy and replaces that module's Supabase cache with
  the complete result.
- SAP ParentNodeId and SequenceNo remain authoritative.
- BrotherId is retained when available.
- V88 three-panel resizing is retained.

## Regression: Logistics - General
The verified OData response uses:
- HierarchyKey: Logistics - General
- TreeId: LO01
- Root NodeId: LO01_T
- Root NodeLevel: 01
- 148 hierarchy records across L1-L5
- 7 direct L2 nodes: Logistics Basic Data, Product Data Management, Forecast,
  Variant Configuration, Engineering Change Management, Environment, Retail

The old 8-node branch must no longer be accepted as the module hierarchy.
