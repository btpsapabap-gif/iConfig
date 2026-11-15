# iConfigPro V90 — Hierarchy Cache Completeness + Upsert Conflict Fix

## Problems observed after V89

1. `FI: ON CONFLICT DO UPDATE command cannot affect row a second time` during hierarchy persistence.
2. `Materials Management` still showed only a tiny partial hierarchy (root + `Produkte`) instead of a complete SAP hierarchy.

## Root causes

### 1. Duplicate rows in one PostgREST upsert payload
Some SAP hierarchy payloads can contain repeated `(TreeId, NodeId)` identities. Sending both rows in one `on_conflict=module_code,language,tree_id,node_id` POST causes PostgreSQL/PostgREST to reject the statement because one target row would be updated more than once.

V90 deduplicates SAP hierarchy rows by `(TreeId, NodeId)` before tree construction and again by the canonical Supabase unique key before persistence.

### 2. Partial Supabase cache was being treated as authoritative
V89 validated the root and parent relationships, but a partial hierarchy could still pass those checks. This allowed an incomplete MM cache such as root + one child to be returned without asking SAP for the full hierarchy.

V90 adds `hierarchy_complete` to `spro_l1_l6_sequence`.

- Existing rows are marked `FALSE` by the V90 migration.
- Runtime cache reads only accept rows where `hierarchy_complete = TRUE`.
- A successful SAP OData load writes all rows with `hierarchy_complete = TRUE`.
- Therefore the old/partial MM cache is not used.

## Runtime flow

Project module -> Supabase complete cache -> use cache.

If no complete cache exists -> SAP `SPROHierarchySet(HierarchyKey)` -> build L1-L6 from `ParentNodeId` + `SequenceNo` -> persist complete cache -> return hierarchy.

No Enterprise Structure branch extraction is used.

## Required DB migration

Run `supabase/v90_hierarchy_cache_completeness.sql` in the real Supabase SQL Editor before deploying V90.

## Validation

Node syntax checks must pass for the changed server files before deployment.
