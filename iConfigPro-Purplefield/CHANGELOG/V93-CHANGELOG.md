# iConfigPro V93 — SAP SPRO Module Root Fix

## Problem

Materials Management L2 values could differ from the SAP SPRO module tree.
The V91 fallback treated a sparse direct module hierarchy as incomplete and
then extracted a same-named branch from Enterprise Structure. That branch is
SAP-derived, but it is not the selected module's own SPRO hierarchy, so deeper
nodes such as purchasing assignments could appear directly under the module.

A second issue existed in the ABAP module lookup: `GET_STRUCTURE_ID` selected a
`TTREET-ID` by description alone. `TTREET` is the language-dependent text table;
the same description can exist for multiple hierarchy structures. The lookup
must be restricted to `TTREE-TYPE = 'IMG'` so the selected structure is the SAP
IMG hierarchy.

## Fix

1. `ZCL_IM_SPRO_IMG=>GET_STRUCTURE_ID`
   - Resolves the structure through `TTREE` + `TTREET`.
   - Restricts the structure to `TTREE-TYPE = 'IMG'`.
   - Uses requested language first, then English, then text fallback.
   - Normalizes `TEXT_CAP` comparison to uppercase.
2. Removed Enterprise Structure branch extraction from the module runtime.
3. Supabase accepts only canonical SAP-rooted module hierarchies as runtime
   cache. Old `ODATA-BRANCH` rows are rejected and will be refreshed from the
   module's own SAP OData hierarchy.
4. SAP `ParentNodeId`, `NodeLevel`, and `SequenceNo` remain authoritative.
5. The `ACTI` / `COBJ` reference enrichment is unchanged.

## Expected Materials Management L2

The module hierarchy returned by SAP SPRO should expose its immediate L2
children, for example:

- General Settings for Materials Management
- Consumption-Based Planning
- Purchasing
- External Services Management
- Inventory Management and Physical Inventory
- Valuation and Account Assignment
- Logistics Invoice Verification

The exact set remains whatever the target SAP system's `SPROHierarchySet`
returns; no static L2 list is hard-coded.
