# iConfigPro V82 — Supabase-First L1–L6 Hierarchy Loading

## Agreed runtime source policy

1. Supabase stores the Project/module assignments.
2. For each assigned module, iConfigPro first checks `spro_l1_l6_sequence` in Supabase.
3. If valid L1–L6 rows exist, those rows are used directly. SAP OData is NOT called.
4. If zero hierarchy rows exist for that module, iConfigPro calls the existing SAP OData service `ZIM_SPRO_IMG_SRV` / `SPROHierarchySet`.
5. A successful OData hierarchy is persisted to Supabase and then displayed.
6. `Refresh Source` is the explicit force-refresh path and calls OData with `refresh=1`.
7. Static `data/sproImgL1L6.json` is not used as a runtime hierarchy source.

## Fixes

- Removed the previous Project-open `refresh=1` behavior that bypassed the Supabase cache.
- Restored cache-first behavior for normal Project opening.
- Kept canonical module-code mapping: ER, FI, CO, LG, SD, MM, LE, QM, PD, PP, PS, TM, PY, PM.
- Existing SAP hierarchy aliases remain supported: Financial Accounting -> FI; Warehouse / Logistics Execution -> LE; Production Planning -> PP.
- Existing Supabase rows that cannot form a valid hierarchy now produce a real integrity error instead of silently triggering OData or a static fallback.
- Explicit Refresh Source now actually requests OData for the selected project's assigned modules.
- L1–L6 remains collapsed by default.
- Bronze/Silver/Gold/Audit Log behavior is unchanged.
