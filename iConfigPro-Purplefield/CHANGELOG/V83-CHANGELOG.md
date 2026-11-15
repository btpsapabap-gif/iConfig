# iConfigPro V83 — Supabase Hierarchy Resolution Fix

## Purpose
Fix Project L1–L6 loading when project modules are stored as canonical codes (ER/FI/CO/MM/SD...) but the existing Supabase hierarchy was populated from SAP OData using the legacy Enterprise Structure representation.

## Runtime policy
1. Project/module assignment is read from Supabase.
2. For each assigned module, Supabase hierarchy is checked first.
3. Direct canonical `module_code` rows are used when present.
4. Legacy `module_name` rows are used when present.
5. If the module is represented inside the existing `Enterprise Structure` tree (for example Financial Accounting, Controlling, Logistics - General, Sales and Distribution, Materials Management, Logistics Execution), the matching L3 branch/branches are selected from the cached Enterprise Structure rows and treated as the project's logical module hierarchy.
6. Only when Supabase has zero hierarchy data for the module does the backend call SAP OData.
7. OData results are persisted back to Supabase.
8. Refresh Source remains the explicit OData refresh path.

## UI
- Existing Enterprise Structure remains a logical ER root.
- Project-selected FI/CO/MM/SD/etc. branches are surfaced as their own L1 roots.
- Duplicate legacy branches for the same logical module are merged while preserving descendants and table associations.
- L1–L6 starts collapsed.
- Bronze/Silver/Gold/Audit Log behavior is unchanged.

## Key fix
The existing Supabase snapshot contains `Financial Accounting`, `Controlling`, `Materials Management`, and `Sales and Distribution` as L3 branches under the `Enterprise Structure` L1 tree. A lookup for canonical `FI`, `CO`, `MM`, or `SD` therefore cannot be treated as an empty cache merely because there is no top-level `module_code` row.
