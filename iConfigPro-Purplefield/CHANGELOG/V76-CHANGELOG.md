# iConfigPro V76 — SPRO Module Catalog + Collapsed L1–L6

1. The L1–L6 Process Directory is now collapsed by default whenever a project/module hierarchy is loaded or changed. Users explicitly expand nodes with the caret.
2. Updated the frontend fallback module catalog to the requested 14 modules and exact display names/order.
3. Added `supabase/v76_spro_modules.sql` to update `public.spro_modules` in the real Supabase database while preserving existing module IDs where possible.
4. Deactivated modules outside the requested catalog.
5. Cache version bumped to V76.

Note: the SQL migration updates the module catalog. The corresponding L1–L6 hierarchy data must exist/populate in `spro_l1_l6_sequence` / SAP OData for each module before those module trees can display their hierarchy.
