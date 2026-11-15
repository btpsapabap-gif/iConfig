# iConfigPro V91 — MM Branch Fallback, SPRO Timeout, iC Brand Mark

## Fixes

1. **FI timeout**
   - Browser SPRO hierarchy requests now allow 120 seconds instead of 30 seconds.
   - SAP `SPROHierarchySet` requests use a dedicated configurable timeout (`SAP_SPRO_IMG_TIMEOUT_MS`, default 120000 ms).

2. **Materials Management partial hierarchy**
   - A sparse direct module hierarchy such as `Materials Management -> Produkte -> ...` is no longer treated as the complete module directory.
   - After the direct SAP OData call, iConfigPro reads the SAP Enterprise Structure hierarchy and extracts the matching module branch using the SAP parent/child relationships.
   - The extracted branch is re-rooted only for presentation as the assigned module; descendant relationships and SAP sequence values are preserved.
   - The fallback is source-derived from SAP, not static JSON and not a hard-coded table list.
   - Such cached rows are marked `source_system=ODATA-BRANCH` and are accepted by the cache validator only when the hierarchy is otherwise structurally complete.

3. **Brand icon**
   - Header mark changed from `iM` to `iC`.
   - Browser asset versions bumped to V91.

## Validation

- Node syntax checks performed for `server/routes/tree.js`, `server/supabaseAdmin.js`, `server/sapClient.js`, and `public/app.js`.

## Supabase migration

Run `supabase/v91_hierarchy_branch_source.sql` before/with deployment. It is safe after V90 and also creates the V90 completeness column if V90 was skipped.
