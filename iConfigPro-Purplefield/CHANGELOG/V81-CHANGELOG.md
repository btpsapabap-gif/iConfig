# iConfigPro V81 — SAP SPRO OData Hierarchy as Project Source

## Root cause
The Project L1–L6 loader was calling `/api/tree/spro` without `refresh=1`. The
backend therefore checked the Supabase hierarchy cache first. An empty, stale,
or incomplete cache could cause the Project Process Directory to remain empty
even though the SAP SPRO OData service `ZIM_SPRO_IMG_SRV` / `SPROHierarchySet`
was available.

## Fix
- Project L1–L6 loading now explicitly calls the SAP hierarchy endpoint with
  `refresh=1`.
- This bypasses the Supabase hierarchy cache for Project loading.
- The backend then uses `ZIM_SPRO_IMG_SRV` / `SPROHierarchySet` as the
  authoritative hierarchy source.
- The existing module-code compatibility mapping remains:
  ER, FI, CO, LG, SD, MM, LE, QM, PD, PP, PS, TM, PY, PM.
- SAP legacy hierarchy labels remain mapped:
  Financial Accounting -> FI
  Warehouse / Logistics Execution -> LE
  Production Planning -> PP
- The backend may persist the fresh OData hierarchy into Supabase after a
  successful OData read, but the UI does not trust stale cache data when a
  Project is opened.
- No fabricated L1-L6 hierarchy nodes are created.
- L1-L6 remains collapsed by default.
- Bronze/Silver/Gold/Audit Log behavior is unchanged.

## SAP OData contract
The project loader uses:
- Service: `ZIM_SPRO_IMG_SRV`
- Entity set: `SPROHierarchySet`
- Module request key: `HierarchyKey`
- The backend resolves the canonical module code to the actual SAP IMG
  hierarchy text and calls the OData service.
- The ABAP implementation is `ZCL_IM_SPRO_IMG`, with
  `GET_MODULE_HIERARCHY`, using `TTREET` -> `STREE_HIERARCHY_READ`.

## Validation
Targeted OData/module regression tests and JavaScript syntax checks pass.
