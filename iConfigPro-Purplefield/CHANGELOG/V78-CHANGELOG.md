# iConfigPro V78 — L1–L6 502 / Canonical Module Hierarchy Fix

## Problem fixed

The Project L1–L6 Process Directory was calling `/api/tree/spro?moduleCode=ER|FI|CO|MM|SD...` and receiving HTTP 502.

## Fix

1. Canonical module codes remain the relationship key.
2. Supabase hierarchy lookup first uses `module_code`; if the V77 hierarchy migration has not yet been executed, the backend safely falls back to the existing `module_name` cache instead of returning HTTP 502.
3. SAP SPRO OData is still preferred when available.
4. If SAP SPRO OData is temporarily unavailable, the existing checked-in SAP IMG hierarchy snapshot is used as a compatibility fallback for modules that have real hierarchy data in that snapshot. No synthetic L1–L6 data is created.
5. Modules with no available hierarchy data return an empty successful response rather than a 502, so one unavailable module cannot blank the entire Project directory.
6. Frontend cache-busting is V78.
7. Bronze/Silver/Gold/Audit Log behavior is unchanged.

## Existing canonical catalog

ER, FI, CO, LG, SD, MM, LE, QM, PD, PP, PS, TM, PY, PM

## Validation

32 targeted regression tests passed; modified server and frontend JavaScript syntax checks passed.
