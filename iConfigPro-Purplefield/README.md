V65 cache/config fix: project .env overrides inherited DATA_MODE/TARGET_MODE; static assets are no-store and versioned.

# iConfigPro E2E Studio — Bronze → Silver → Gold

Node.js 20+ reference implementation based on **iConfigPro Config Studio Node v20**.

## Bronze

- Reads `ZIM_BCSET_BRONZE_SRV/BCSetValueSet` using the exact source property `BCSetID`.
- Uses source client 200 by default.
- Reassembles long-form `TableName / RecNumber / FieldName / FieldValue` rows into configuration records.
- Shows an aligned table grid like the reference Studio.
- All tables are selected by default.
- Every table has an expansion arrow; expanding a table shows its records.
- All records are selected by default.
- Table-level and record-level selection are independent and preserved while the grid re-renders.

## Silver

- Validates table/record identity and duplicate record keys.
- Trims values.
- Allows field additions and value modifications.
- Allows record removal.

## Gold
## Gold target-key/value behavior

Gold keeps the existing `DeployTableSet` / `DeployRowSet` / `DeployFieldSet` structure, but the deployment stage uses the final Silver rows as the source of truth for field values. Source E071/E071K data is used only as transport/object provenance metadata.

For client-dependent customizing keys, E071K `TABKEY` is rebuilt from the final Silver DDIC key fields and the target client. For example, source client `200` with `T001-BUKRS=1000` may have source TABKEY `2001000`; a target client `500` is deployed with TABKEY `5001000`. A Silver-added row `T001-BUKRS=9000` is deployed as `5009000` using the same source E071 parent metadata. Source TABKEYs are never copied unchanged into the target deployment payload.


The Gold builder deliberately follows the reference deployment model:

`DeployRequest -> DeployTableSet -> DeployRowSet -> DeployFieldSet`

Before building the payload it:

- removes `MANDT` / `CLIENT` from deploy values;
- drops blank non-key fields;
- keeps key fields even when blank;
- renumbers selected records densely per table (`1..n`);
- supplies `Viewname` at table level.

These rules are important because the SAP BC Set conflict-check path expects a usable value row for every staged record. SAP KBA 3589578 documents an `ITAB_LINE_NOT_FOUND` pattern in `SCPR_PRSET_CT_KEY_CONFLICTS2` reached through `SCPR_EXT_BCSET_WRITE`.

## Deployment

The server posts to `ZIM_BCSET_DEPLOY_SRV/DeployRequestSet` with CSRF handling.

When the source service exposes these optional entity sets, the server also reads and attaches:

- `BCSetE071Set` → `SourceE071Json`
- `BCSetRecAttrSet` → `SourceRecAttrJson`

The supplied reference ABAP is under `sap-reference/`.

## SAP configuration

```text
PORT=4000
DATA_MODE=sap
TARGET_MODE=sap

SAP_PROTOCOL=http
SAP_HOST=mckeccasf210.mckinsol.com
SAP_PORT=8014
SAP_CLIENT=200
SAP_USER=<source user>
SAP_PASSWORD=<source password>
SAP_BCSET_ID=ZS2P_FICO_001

SAP_DEPLOY_PROTOCOL=http
SAP_DEPLOY_HOST=<target host>
SAP_DEPLOY_PORT=8000
SAP_DEPLOY_CLIENT=200
SAP_DEPLOY_USER=<target user>
SAP_DEPLOY_PASSWORD=<target password>
SAP_DEPLOY_SERVICE=ZIM_BCSET_DEPLOY_SRV
SAP_DEPLOY_ENTITYSET=DeployRequestSet
SAP_DEPLOY_SEND_SOURCE_METADATA=true
```

## Run

```powershell
npm install
npm start
```

Open `http://localhost:4000`.

## If deployment still reports `SCPR_EXT_BCSET_WRITE ... CX_SY_ITAB_LINE_NOT_FOUND`

The browser has successfully reached the target service; the exception is being raised inside the target SAP runtime. Check ST22 and confirm whether the failing function is `SCPR_PRSET_CT_KEY_CONFLICTS2`. Compare the active target worker with `sap-reference/target/ZIM_DEPLOY_2_ZCL_IM_BCSET_DEPLOY.abap` and syntax-check/activate the intended version.


## v7 target ABAP syntax corrections

The target class uses `SCPRRECA` for the TABLES parameter of `SCPR_TEMPL_MN_TEMPLATE_SAVE` and explicit work areas for `KO200`, `E071K`, `SCP1_GENERAL_ERRORS`, and exception references. Inline DATA declarations were removed from CALL FUNCTION positions and other compatibility-sensitive locations.


## v11 target transport behavior
Gold carries RawTableKey from Bronze. Target transport provenance is filtered to the selected business records only; RecNumber is not used as a transport key. Activation is requested by the Studio workflow after staging the selected Gold content.


## V12 payload fix
RawTableKey is internal Bronze/Gold provenance only. The deploy route uses it to select exact source E071K TABKEYs, then removes it from DeployTableSet before POSTing to the target OData service because RawTableKey is not a target DeployRow property.


## Deployment mode
The normal Gold deployment uses the previous Stage + Activate workflow: selected content is staged into the target Customizing request/task and then the standard target BC Set activation path is invoked when `Activate=true`.

## V20 + V21 consolidated final fixes
- Physical-table business-key dedup now treats a blank-but-present key field as a valid SAP key value; only an absent key field is incomplete.
- Gold cleanup retains blank DDIC key fields while removing only technical `MANDT`/`CLIENT` and blank non-key fields.
- Deployment keeps the authoritative E071K `RawTableKey` internally, maps selected records to exact source E071K rows, and never posts `RawTableKey` to the target OData entity.
- Deployment UI restores the explicit **Stage and activate** checkbox: unchecked = Stage only; checked = Stage + Activate.
- Existing target BC Set persistence uses `SCPR_TEMPL_MN_TEMPLATE_SAVE` with transport insertion enabled and selected-content verification rather than whole-BC-Set count comparison.
- Existing `ZIM_BCSET_ODATA_SRV` and the established target deployment architecture are not changed by this release.


## V22 diagnostic/provenance hardening
- Source E071/E071K reads now retry unfiltered entity-set reads when a valid filtered request returns zero rows.
- Deployment no longer silently posts a request with empty SourceE071Json; it stops at the Node layer with explicit source-metadata diagnostics.
- Target DPC_EXT reports that SourceE071Json was empty instead of using the generic message where supported.

## V23 source-provenance fail-closed diagnostic
- Deployment no longer silently proceeds when source metadata acquisition fails.
- `SourceE071Json` must contain real E071/E071K provenance before a target POST is made.
- `BCSetRecAttrSet` rows alone can no longer make source metadata appear available.
- If E071/E071K is incomplete, the Node API returns HTTP 502 with row-count diagnostics and does not create/alter the target deployment request.

## V24 source metadata retrieval fix
- `BCSetE071Set`, `BCSetE071KSet`, and `BCSetRecAttrSet` no longer silently become empty when the custom Gateway provider rejects `$filter`.
- A failed/HTTP 400 filtered read now falls back to a paged unfiltered read and scopes rows by BC Set ID in Node.
- Deployment remains fail-closed if actual E071/E071K provenance cannot be assembled.

## V25 TKA02 provenance resolution
- Restores the source-record provenance selector from the working V19 path.
- Deployment now reads `BCSetValueSet` in addition to E071/E071K so Gold `SourceRecnumber` can be matched against the original source key fields.
- Blank-but-present DDIC key values are accepted; TKA02 `GSBER=''` is not treated as a missing key.
- Exact source-value/DDIC-key reconstruction is preferred; the legacy ordinal fallback remains only as a last-resort compatibility path.

## V26 consolidated source-provenance fix
This is the consolidated release for the previously identified V20-V25 defects:
- Physical DDIC-key deduplication with blank-but-present key values preserved.
- TKA02 `BUKRS=1000` + blank `GSBER` is a valid source key; blank does not mean missing.
- Source E071/E071K retrieval falls back to an unfiltered paged read even when a filtered OData request returns HTTP 200 with zero rows.
- Source `BCSetValueSet` is used to resolve original source record provenance.
- Exact E071K `TABKEY`, `SourceE071Seq`, Activity, MasterType, MasterName and ViewName are preserved.
- `RawTableKey`, `SourceRecnumber`, and provenance markers are internal and are never posted to the target DeployRow entity.
- Deployment is fail-closed when exact source provenance cannot be assembled.
- Stage-only / Stage-and-activate checkbox behavior is retained.
- Target BC Set persistence uses `SCPR_TEMPL_MN_TEMPLATE_SAVE` with transport insertion enabled; selected-content verification does not compare selected counts with the whole existing BC Set.
- Standard `SCPR_ACTIVATE_BCSETS_REMOTE` remains the activation mechanism.
- Existing `ZIM_BCSET_ODATA_SRV` and the established target deployment architecture remain untouched.
- `/api/deploy/provenance?bcsetId=...&tables=...` provides a read-only source preflight and never posts to the target.

## V27 consolidated provenance baseline
V27 supersedes the incremental V20-V26 provenance fixes as one consolidated baseline.
- The original source `BCSetValueSet.RecNumber` is carried from Bronze through Silver into Gold as internal `SourceRecnumber`.
- When complete DDIC key metadata is available, it remains authoritative.
- When static metadata is incomplete, identical normalized field sets are deduplicated conservatively rather than using BC Set RecNumber as business identity.
- If Gold lacks a SourceRecnumber, provenance may infer it only when exactly one source record matches every supplied Gold field value; no TABKEY is guessed.
- Exact E071K `TABKEY` remains the only accepted source transport key.


## Bronze Admin / Supabase

The Bronze Projects/Modules administration UI is enabled only when the authenticated user exists in `iconfig_users` with `role = ADMIN` and `is_active = true`. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. The service-role key must never be exposed to browser code. Existing Bronze/Silver/Gold migration routes remain unchanged.

## Local Admin / Supabase setup

The Admin Projects and Modules functions work locally as well as on BTP.

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_URL` to your Supabase project URL.
3. Set `SUPABASE_SERVICE_ROLE_KEY` to the Supabase service-role key. This value is server-side only and must never be placed in `public/app.js` or any browser-exposed file.
4. Keep `AUTH_MODE=none` for local development.
5. Set `LOCAL_USER_EMAIL` to the email of the local administrator. That email must exist in `public.iconfig_users` with `role='ADMIN'` and `is_active=true`.
6. Install dependencies with `npm install`.
7. Start with `npm start` and open `http://localhost:4000`.

Example local `.env` entries:

```text
AUTH_MODE=none
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
LOCAL_USER_EMAIL=achaitanya@mckinsol.com
```

On BTP, keep the same server-side Supabase variables in the application environment and use XSUAA authentication. The local identity fallback is only used when `AUTH_MODE=none`.

## Local Admin / Supabase setup

For local Bronze administration, copy `.env.example` to `.env` and set:

- `AUTH_MODE=none`
- `SUPABASE_URL=<your Supabase project URL>`
- `SUPABASE_SERVICE_ROLE_KEY=<server-side service-role key>`
- `LOCAL_USER_EMAIL=<the email in public.iconfig_users with role ADMIN>`

The service-role key is server-side only and must never be placed in `public/app.js` or other browser assets. The Bronze Projects/Modules panel is intentionally visible in local development; project creation and module saving are enabled only after the server confirms the authenticated/local identity is an active `ADMIN` in `iconfig_users`.

## V58 Bronze SPRO hierarchy corrections

- The Bronze second-panel hierarchy is sourced from the `L1-L6 IMG Config` Excel catalogue for L1-L5.
- A selected Project now displays **all modules assigned to that project** in the second panel, rather than only the first assigned module.
- Each assigned module displays its complete available L1-L5 hierarchy.
- Selecting any L1, L2, L3, L4, or L5 node drives the third panel's related configuration/T-table scope; L3 is not a prerequisite.
- The existing Projects, Modules, Supabase, authentication, Bronze extraction/selection, Silver, Gold, deployment, validation, staging, and activation functionality is otherwise unchanged.
- All `.txt` files were removed from this release. This README is the only documentation file updated for these corrections.


### V58.1 Bronze table-value mapping correction

- The supplied `L1-L6 IMG Config` workbook has no populated `L6 - T Table` values; the configuration table identifiers are populated in the `L5 - Configuration Purpose` column.
- Bronze now treats the populated L5 value as the T-table identifier when L6 is blank, while preserving the L1-L5 display hierarchy.
- This restores Bronze BC Set matching for nodes such as `T001`, so SAP-returned T001 records/field values can be displayed and selected.

### V58.2 Bronze tree initial-state correction

- The Bronze L1-L5 process directory now loads with all L1 nodes collapsed.
- Users must explicitly click an L1 to expand it.
- No other project/module, T-table/value, authentication, Supabase, Bronze/Silver/Gold, or deployment behavior was changed.

### V58.3 Silver Add Fields field picker

- Silver `+ field` now opens a searchable field list for the selected table instead of requiring manual field-name entry.
- The list is populated from fields exposed by the selected BC Set for that table, supplemented by the table's configured DDIC key fields.
- Existing fields are shown as `EXISTS` and cannot be selected again.
- DDIC key fields are visibly marked `KEY`.
- The selected field still requires the user to enter its Silver value before adding it.
- Added fields are tracked as Silver additions and continue through the existing Silver → Gold path.
- Existing Bronze, Silver validation, Gold, provenance, E071/E071K, TABKEY, staging, activation, authentication, and project/module behavior is unchanged.

## V58.4 – SAP DDIC field picker

The Silver **+ field** picker now reads the complete field catalog for the selected SAP table from `ZIM_DDIC_FIELDS_SRV/TableFieldSet` instead of using BC Set values as the field catalog. The picker uses SAP DDIC field name, description, datatype, length, decimals, position, and key indicator. Existing Bronze BC Set extraction and Silver → Gold deployment behavior are unchanged.

The SAP connection uses the existing source SAP host/client/user/password by default. Override only the service name with `SAP_DDIC_FIELDS_SERVICE` (default: `ZIM_DDIC_FIELDS_SRV`).


## V58.9 — Selected Module panel removed
The redundant “Selected Module” card in the Bronze sidebar has been removed. Project scope and explicit module filtering continue to work without displaying that status card.

## V69 SPRO sequence fix

Enterprise Structure Process Directory ordering is now explicitly aligned to the supplied SPRO display order for its L2/L3 siblings, even when the runtime OData response includes a BROTHER_ID chain in a different technical order. Other modules continue to preserve their SAP sibling order.

### Startup

After extracting the pack, run:

```powershell
npm ci
npm start
```

`node_modules` is intentionally not distributed in this pack; dependencies are restored from `package-lock.json`.

## V71 SPRO sequence correction

The SAP SPRO hierarchy sequence is sourced from `STREE_HIERARCHY_READ`. The ABAP baseline must not sort `ET_NODES` or the final hierarchy by node ID/level/parent, because those sorts destroy SAP's sibling presentation order. Use `ZCL_IM_SPRO_IMG_V71_SEQUENCE_FIX.abap` as the corrected full class source.

After activating the corrected ABAP class, refresh a module once with:

`GET /api/tree/spro?module=Enterprise%20Structure&language=E&refresh=true`

The refresh bypasses the existing Supabase cache, reads OData, persists the returned sibling order as `sequence_no`, and subsequent requests use Supabase first.


## V72 — Project access, Gold deployment versions and Audit Log

- Project creation is no longer ADMIN-only. Any authenticated active `iconfig_users` user can create a project, assign modules, and continue through Bronze → Silver → Gold.
- Gold deployment history is persisted in `iconfig_gold_deployments`.
- Every successful Gold deployment receives a monotonically increasing version for the selected Project + BC Set + target client.
- Before deployment, the server compares the current Gold payload against the latest deployed version field-by-field using `Table | Rec# | Field | Value`.
- If there is no field-level change, the UI explicitly shows **Already deployed, want to overwrite it**. The overwrite must be checked before the server will post the deployment.
- Changed deployments show field-level Added / Changed / Removed differences before the user deploys.
- Gold displays deployment version history.
- The new **Audit Log** panel appears below Gold and records project creation, module assignment changes, and successful Gold deployments/overwrites.
- Supabase migration: `supabase/v72_gold_versions_audit.sql`.
