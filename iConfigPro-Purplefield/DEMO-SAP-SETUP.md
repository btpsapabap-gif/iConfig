# V7 Demo — SAP -> SAP

1. Copy `.env.example` to `.env`.
2. Fill the source and target SAP credentials/host values.
3. Keep `DATA_MODE=sap` and `TARGET_MODE=sap`.
4. Keep `SAP_SOURCE_SERVICE=ZIM_BCSET_BRONZE_SRV`.
Set `SAP_SOURCE_METADATA_SERVICE=ZIM_BCSET_ODATA_SRV` because the E071/RECATTR entity sets are implemented on that source metadata service.
5. Run `npm start`.

Expected startup line:

`iConfigPro E2E running at http://localhost:4000 | source=sap target=sap`

The source ValueSet uses the exact new Bronze OData property `BcsetId` in `$filter`.
The source deployment metadata uses:
- `BCSetE071Set` -> `SourceE071Json`
- `BCSetRecAttrSet` -> `SourceRecAttrJson`

Gold/deployment logic is otherwise unchanged.
