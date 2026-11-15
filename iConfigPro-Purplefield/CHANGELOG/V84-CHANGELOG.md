# iConfigPro V84 — Multi-Module L1–L6 Aggregation Fix

- Preserve the agreed Supabase-first hierarchy policy.
- Treat legacy Enterprise Structure rows containing FI/CO/LG/SD/MM/LE as module branches when canonical module rows are absent or incorrectly stamped.
- Re-root matched legacy module branches as their canonical L1 module and display the catalog name (for example Financial Accounting (New)).
- Aggregate every assigned module result into the L1–L6 Process Directory; a successful ER result can no longer hide a failed/missing FI result.
- Preserve explicit Refresh Source as the only forced OData path.
- Surface per-module hierarchy errors instead of silently dropping failed modules.
- Browser asset cache version bumped to V84.
