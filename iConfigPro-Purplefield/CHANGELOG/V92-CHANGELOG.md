# iConfigPro V92 — E071K Provenance / Gold TABKEY Fix

## Problem fixed
Gold deployment could fail before target posting with:

`Selected Gold records could not all be mapped to exact source E071K TABKEYs.`

and:

`Final Silver row does not contain all DDIC key fields required to derive the target E071K TABKEY`

The affected records can be existing source-derived Silver rows for which the static `data/tableMetadata.json` does not contain the physical table's DDIC key definition. In that situation, the previous Gold mapper tried to reconstruct the target TABKEY from final Silver fields and failed.

## V92 behavior

### 1. Existing source rows preserve authoritative E071K TABKEY provenance
For a row that has a source record and a matching source E071K row:

- Gold still derives the target TABKEY from final Silver DDIC key values when all required key fields are available.
- If the final Silver row is missing one or more key fields, Gold now falls back to the authoritative source `E071K-TABKEY`.
- When source and target clients are known and the source TABKEY begins with the source client, only that client prefix is replaced with the target client.
- A genuinely new Silver row has no source record and therefore does not receive an arbitrary source TABKEY.

This removes the need for table-specific hard-coded TABKEY logic.

### 2. SAP DDIC is used when the local metadata baseline is incomplete
During SAP deployment preflight, if a deployment table is missing from the local `tableMetadata.json` key catalogue:

- `ZIM_DDIC_FIELDS_SRV` is queried for that table.
- DDIC fields marked as key fields are used in their SAP position order.
- These runtime DDIC keys take precedence for target TABKEY derivation.
- If runtime DDIC lookup is unavailable, existing source rows can still use their preserved source E071K TABKEY fallback.

### 3. Existing behavior remains unchanged
- Complete Silver key fields continue to produce target-client TABKEYs from final Silver values.
- Silver-added rows continue to require enough DDIC key information to construct a new target TABKEY.
- No table-specific key assumptions were added.
- Source E071/E071K and SCPRRECA provenance remains authoritative for deployment metadata.
- V91 SPRO hierarchy, MM branch fallback, FI timeout, and `iC` branding changes are retained.

## Validation performed

- `node --check server/provenance.js` — PASS
- `node --check server/index.js` — PASS
- `node --check server/routes/layers.js` — PASS
- `node --check server/sapClient.js` — PASS
- `node --test test/provenance-v92.test.js` — 2 passed, 0 failed
- Direct provenance regression checks for:
  - Existing source row with missing final DDIC key fields → source E071K TABKEY fallback — PASS
  - Runtime SAP DDIC key metadata → final Silver values → target TABKEY — PASS

The full Node test suite could not be rerun in this environment because the uploaded workspace currently has an incomplete `node_modules` installation (`express` is missing); an attempted `npm ci --ignore-scripts --no-audit --no-fund` exceeded the execution transport timeout. This is an environment/dependency limitation, not a reported test assertion failure.
