# iConfigPro V80 — L1–L6 Hierarchy Availability Fix

## Root cause addressed
The V79 tree endpoint could accept a non-empty Supabase/SAP hierarchy response even when those rows could not be assembled into a valid root tree. That caused the UI to show “No L1–L6 hierarchy data is available” even though the application contains the real SAP IMG hierarchy snapshot.

## Fix
- Validate the assembled cached tree before accepting the Supabase result.
- Validate the assembled SAP tree before accepting OData as authoritative.
- If either source is structurally incomplete, fall back to the existing real SAP IMG snapshot for that module.
- No hierarchy nodes are invented.
- Canonical module-code linkage remains ER/FI/CO/LG/SD/MM/LE/QM/PD/PP/PS/TM/PY/PM.
- Bronze/Silver/Gold/Audit Log behavior is unchanged.

## Validation
The module-code regression suite includes a guard for incomplete hierarchy fallback.
