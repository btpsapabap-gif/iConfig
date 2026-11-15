# iConfigPro V77 — Canonical Project Module ↔ L1-L6 Linkage

## Problem fixed

Project module assignments and the L1-L6 Process Directory were being matched by display name. The project now uses stable canonical module codes, while the SAP IMG hierarchy/cache can retain SAP's legacy display labels.

## Canonical module catalog

| Code | Module |
|---|---|
| ER | Enterprise Structure |
| FI | Financial Accounting (New) |
| CO | Controlling |
| LG | Logistics - General |
| SD | Sales and Distribution |
| MM | Materials Management |
| LE | Logistics Execution |
| QM | Quality Management |
| PD | Production |
| PP | Production Planning for Process Industries |
| PS | Project System |
| TM | Time Management |
| PY | Payroll |
| PM | Personnel Management |

## What changed

1. Project assignments use `spro_modules.module_code` as the stable relationship key.
2. L1-L6 requests use the project module code instead of joining on display names.
3. `spro_l1_l6_sequence` gets a `module_code` column.
4. Existing hierarchy rows are backfilled using compatibility mappings:
   - Financial Accounting → FI
   - Warehouse / Logistics Execution → LE
   - Production Planning → PP
5. SAP OData lookup prefers the canonical SAP IMG name and tries the known legacy aliases when needed.
6. Supabase hierarchy cache lookup uses `module_code` first and falls back to the legacy module name only for migration compatibility.
7. The frontend filters L1-L6 roots by `module_code`, so only modules actually saved against the selected project are shown.
8. No fake L1-L6 hierarchy records are created for modules that do not exist in the source SAP hierarchy.
9. L1-L6 remains collapsed by default.
10. Browser asset cache-busting is V77.

## Supabase migrations

Run these in order in the actual Supabase SQL editor:

1. `supabase/v77_spro_modules_canonical.sql`
2. `supabase/v77_module_code_hierarchy.sql`

The first migration normalizes the 14 module records and their short codes. The second adds/backfills the canonical code on the L1-L6 hierarchy cache.

## Validation

- JavaScript syntax checks passed.
- 41 dependency-free regression tests passed.
- The existing smoke test cannot run in the packaging environment because `node_modules` is intentionally absent and `express` is therefore unavailable. This is an environment/dependency condition, not a failed application assertion.
