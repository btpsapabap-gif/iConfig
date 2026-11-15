# Target V21 — use SCPR_TEMPL_MN_TEMPLATE_SAVE

The previous v5 target worker called `SCPR_EXT_BCSET_WRITE` and the target raised `CX_SY_ITAB_LINE_NOT_FOUND` in `SCPR_PRSET_CT_KEY_CONFLICTS2`.

This version removes that call from the deployment worker. The target flow is:

1. Build `SCPRVALS` / `SCPRRECA` with dense record numbers.
2. `SCPR_CT_TRANSPORT_CHECK`.
3. `SCPR_TEMPL_MN_TEMPLATE_SAVE` using the live signature supplied from the target.
4. `WITH_TRANSP_INSERT = 'X'`, so the standard SAVE routine calls `SCPR_CT_TRANSPORT_INSERT`.
5. `WITH_COMMIT = 'X'`.
6. Verify `SCPRATTR`, `SCPRRECA`, `SCPRVALS`, and `R3TR SCP1 <BCSET_ID>`.
7. Only if requested, call `SCPR_ACTIVATE_BCSETS_REMOTE`.

The exact live call uses:

- `PROFID = <BCSET_ID>`
- `PROFTEXT = <description>`
- `ORGID = '/0SAP/'`
- `BCSET_TYPE = 'TMV'` (the target FM's own default)
- `WITH_TRANSP_INSERT = 'X'`
- `WITH_COMMIT = 'X'`
- `VALUES = lt_vals`
- `RECATTR = lt_recattr`

Do not leave the old `SCPR_EXT_BCSET_WRITE` implementation active on the target class. Syntax-check and activate the supplied class/redefinition in the target system first.
