# SAP Target deployment diagnostic

The Node application has been aligned to the V20 deep-insert model:

- `DeployTableSet -> DeployRowSet -> DeployFieldSet`
- `Recnumber` is sent as a quoted string.
- `Viewname` is present at DeployTable level.
- `MANDT` / `CLIENT` are removed from deploy values.
- Blank non-key fields are removed.
- Record numbers are dense per table (`1..n`).
- When the source exposes them, `SourceE071Json` and `SourceRecAttrJson` are added to the request.

## Exact error reported by SAP

If the target returns:

`SCPR_EXT_BCSET_WRITE raised ... CX_SY_ITAB_LINE_NOT_FOUND`

check **ST22** on the target immediately. SAP KBA **3589578** documents the same exception pattern in `SCPR_PRSET_CT_KEY_CONFLICTS2`, reached through `SCPR_EXT_BCSET_WRITE`, with source code using `values[ 1 ]-recnumber`.

This is a target-side ABAP/SAP-standard failure, not a browser rendering error. The supplied V20 worker is included under `target/` for comparison/activation, but it must be syntax-checked and activated in the target SAP system.

First verify in ST22:

1. Program/include containing `SCPR_PRSET_CT_KEY_CONFLICTS2`.
2. The failing table/BC Set and `RECNUMBER` values.
3. Whether `SCPRVALS` has values for every `SCPRRECA` record.
4. Whether the active worker/DPC is the supplied V20 implementation.

The Node application cannot repair an exception raised inside SAP standard function group `SAPLSCPRPS`; it can only ensure the posted data shape is clean. The V6 target worker therefore removes the failing `SCPR_EXT_BCSET_WRITE` call and uses the target system's supplied `SCPR_TEMPL_MN_TEMPLATE_SAVE` interface instead.
