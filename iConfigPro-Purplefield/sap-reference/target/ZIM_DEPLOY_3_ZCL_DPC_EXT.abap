*& V9 NOTE: TR_SOURCEBCSETID is intentionally a studio-side correlation
*& identifier (SOURCE TR + SOURCE BC SET), e.g. DEVK900123_ZP2P_FICO_001.
*& It is not posted as a new OData property, so existing SEGW metadata is
*& unchanged. The actual source TR is provenance; the BC Set data still
*& travels in the existing SourceE071Json/Deploy* payload.

*&---------------------------------------------------------------------*
*& ZCL_ZIM_BCSET_DEPLOY_DPC_EXT — the deep-insert entry point
*&
*& Rewritten against the REAL $metadata of ZIM_BCSET_DEPLOY_SRV, pulled via
*& /IWFND/GW_CLIENT. Two things in the earlier version of this file were
*& wrong, and are now corrected because they are confirmed, not guessed:
*&
*&   1. The navigation properties are NOT the association names
*&      (RequestToTables / TableToRows / RowToFields). SEGW named them
*&      DeployTableSet / DeployRowSet / DeployFieldSet instead - the
*&      "<EntityType>Set" fallback it uses when nothing else is specified.
*&      Get this wrong and read_entry_data returns an empty nested table
*&      with NO error at all - which is exactly why it needed a live
*&      metadata pull to settle, rather than another guess.
*&
*&   2. DeployRequest's boolean field is called Activate (CONFIRMED by the
*&      user directly, 2026-09-13 - this file previously said the reverse,
*&      "Activity, not Activate", on a mistaken reading of $metadata; that
*&      was wrong and led to repeated back-and-forth fixes in the studio.
*&      Activate is correct - do not change this again without the user
*&      re-confirming against the real $metadata first).
*&
*&   3. Recnumber is Edm.String on both DeployRow and DeployField - it must
*&      travel as a quoted JSON string. The studio side of this was fixed
*&      to send it that way; nothing changes here because of it, since
*&      ABAP converts a numeric string to i automatically on assignment.
*&
*&   4. DeployTable needs a NEW property, Viewname (Edm.String), added in
*&      SEGW before this file's step 2 will even compile: the studio now
*&      sends the source's maintenance view per table (e.g. V_T001 for
*&      T001), and step 2 reads it off ls_tab-viewname. Without it, a
*&      real maintenance-view change was being pre-registered on the
*&      target under an invented R3TR SCP1 <bcset_id> object instead of
*&      the real R3TR VDAT <view> - confirmed against a real transport's
*&      own Object list. Add Viewname to DeployTable in the Data Model,
*&      regenerate, and republish so $metadata carries it before pasting
*&      this file's body.
*&
*&   5. DeployRequest needs a NEW property too, SourceE071Json
*&      (Edm.String): the real E071/E071K entries SCPR_BCSET_DATA_TO_E071
*&      derived on the SOURCE system (where the BC Set already exists -
*&      see ZIM_SOURCE_1_E071_ENTITYSET.abap), one JSON array, so the
*&      worker can replay them instead of deriving its own guess. Step 3b
*&      below parses it and passes it through as IT_SOURCE_E071 - optional
*&      on the worker side, so an old caller that never sends this
*&      property still works exactly as before (falls back to the
*&      worker's own derivation). Each entry now also carries Activity
*&      (added 2026-09-13) - E071-ACTIVITY itself, the field behind the
*&      "IMG Activity" column on a transport's object entry. No change
*&      needed in THIS file for that - /ui2/cl_json=>deserialize fills
*&      whatever fields zcl_im_bcset_deploy=>tt_e071_entry now declares,
*&      generically, off the same camelCase-matched JSON.
*&
*&   6. DeployRequest needs one more NEW property, SourceRecAttrJson
*&      (Edm.String, 2026-09-12): SCPRRECA's real per-record attributes
*&      (ObjectName/ObjectType/Documentation Object/Uncomplete) mirrored
*&      from the source system - see ZIM_SOURCE_2_RECATTR_ENTITYSET.abap.
*&      Step 3c below parses it the same way as SourceE071Json and passes
*&      it through as IT_SOURCE_RECATTR - optional on the worker side too.
*&
*&   DeployRequest ──DeployTableSet──> DeployTable
*&                                         │
*&                                    DeployRowSet
*&                                         ▼
*&                                     DeployRow ──DeployFieldSet──> DeployField
*&
*& EVERYTHING IS INSIDE THE METHOD. There is nothing to add to the class
*& definition, no private section to edit, no Types tab to fill in. The
*& deep structure is declared locally because it is used nowhere else.
*&
*& That also sidesteps "You cannot edit the section directly in
*& modification mode" — the Class Builder message you get when the class
*& is open in form-based mode and you try to type into the definition.
*&
*& ---------------------------------------------------------------------
*& HOW TO CREATE THE REDEFINITION
*&
*& In ADT / Eclipse (easiest — the class is source-based there):
*&   open ZCL_ZIM_BCSET_DEPLOY_DPC_EXT, put the cursor in the class,
*&   Ctrl+1 > "Redefine method", pick
*&   /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY, paste the body.
*&
*& In SE80:
*&   1. Methods folder > Inherited Methods
*&   2. find /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY
*&   3. right-click > Redefine
*&   4. the method opens empty and writable — paste the body
*&
*& In SE24 form-based:
*&   Methods tab > position on the inherited method > the "Redefine"
*&   button (or Edit > Redefine) > paste the body.
*&
*& If you would rather have the whole class as one text editor:
*&   SE24 > Utilities > Settings > Class Builder tab > tick
*&   "Source Code-Based". The class then opens as plain source and the
*&   definition becomes editable too.
*&
*& ---------------------------------------------------------------------
*& IF YOU GET: Class "OBJECT" does not contain an interface
*&             "/IWBEP/IF_MGW_APPL_SRV_RUNTIME"
*&
*& super-> means "the superclass of the class I am in", and the compiler
*& is saying that superclass is OBJECT — the root class. So the method is
*& not in ZCL_ZIM_BCSET_DEPLOY_DPC_EXT, or it was not created as a
*& redefinition of the inherited method.
*&
*& Check, in SE80 on the class you are editing:
*&
*&   1. the title bar says ZCL_ZIM_BCSET_DEPLOY_DPC_EXT — not
*&      ZCL_IM_BCSET_DEPLOY (file 2), which has no superclass and is the
*&      easy one to land in by mistake
*&
*&   2. the Superclasses folder shows ZCL_ZIM_BCSET_DEPLOY_DPC. If that
*&      folder is empty, this class inherits from OBJECT and no amount of
*&      editing this method will help
*&
*&   3. the method arrived through Methods > Inherited Methods >
*&      /IWBEP/IF_MGW_APPL_SRV_RUNTIME~CREATE_DEEP_ENTITY > right-click >
*&      Redefine. Implementing the interface freshly, or adding a new
*&      method of that name, gives you a method with no parent to call.
*&
*& If all three are right and the error persists, see FALLBACK at the
*& bottom of this file.
*&
*& ---------------------------------------------------------------------
*& THE FOUR PROPERTIES ON DeployRequest — CONFIRMED, NOT ASSUMED
*&
*& The real $metadata shows exactly seven properties on DeployRequest:
*& BcsetId, BcsetText, TargetCli, Trkorr, Activate, Status, Records - plus
*& the two added since, SourceE071Json (see item 5 above) and
*& SourceRecAttrJson (see item 6 above). There is no Message, no Tables,
*& no Values. This method only ever writes to Status and Records on the
*& response - nothing else exists to write to.
*&
*& NOT COMPILED — no SAP system was available. Syntax-check in ADT/SE24.
*& ---------------------------------------------------------------------

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.

*&--- the shape read_entry_data fills --------------------------------------
*&   Each level is the SEGW-generated ROW STRUCTURE plus one component per
*&   navigation property. The structures must come from the MPC — a
*&   hand-written one of the same shape is simply not filled.
*&
*&   The generated TT_* table types are deliberately NOT used. On some
*&   releases SEGW declares them generically, and ABAP will not accept a
*&   generic type as a structure component ("TT_DEPLOYFIELD is a generic
*&   type. Use this type only for typing field symbols and formal
*&   parameters."). read_entry_data does not care which table type the
*&   component has — only that it is a table of the right row structure —
*&   so each one is declared here from the TS_* structure instead.
    TYPES tt_field TYPE STANDARD TABLE OF zcl_zim_bcset_deploy_mpc=>ts_deployfield
                        WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_row.
             INCLUDE TYPE zcl_zim_bcset_deploy_mpc=>ts_deployrow.
    TYPES:   deployfieldset TYPE tt_field,
           END OF ty_row.
    TYPES tt_row TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_table.
             INCLUDE TYPE zcl_zim_bcset_deploy_mpc=>ts_deploytable.
    TYPES:   deployrowset TYPE tt_row,
           END OF ty_table.
    TYPES tt_table TYPE STANDARD TABLE OF ty_table WITH DEFAULT KEY.

    TYPES: BEGIN OF ty_deep.
             INCLUDE TYPE zcl_zim_bcset_deploy_mpc=>ts_deployrequest.
    TYPES:   deploytableset TYPE tt_table,
           END OF ty_deep.

    DATA: ls_deep          TYPE ty_deep,
          lt_values        TYPE zcl_im_bcset_deploy=>tt_value,
          ls_value         TYPE zcl_im_bcset_deploy=>ty_value,
          lt_source_e071   TYPE zcl_im_bcset_deploy=>tt_e071_entry,
          lt_source_recattr TYPE zcl_im_bcset_deploy=>tt_recattr_entry,
          ls_resp          TYPE zcl_zim_bcset_deploy_mpc=>ts_deployrequest,
          lv_tab           TYPE tabname,
          lv_rec           TYPE i,
          lv_activate      TYPE abap_bool,
          lv_flag          TYPE string,
          lv_msg           TYPE bapi_msg.

    CASE iv_entity_set_name.

      WHEN 'DeployRequestSet'.

*&--- 1. read the posted body against the model ---------------------------
*&   Wrapped in TRY/CATCH cx_root: if the posted JSON does not match the
*&   model the way the framework expects, read_entry_data can raise its
*&   own class-based exception here, before any of this method's own
*&   RAISE statements ever get a chance to run - which shows up exactly
*&   as a blank, generic /IWFND/CX_MGW_BUSI_EXCEPTION with no text and
*&   no ST22 dump. This surfaces the real class and text instead.
        TRY.
            io_data_provider->read_entry_data( IMPORTING es_data = ls_deep ).
          CATCH cx_root INTO DATA(lx_read).
            lv_msg = |read_entry_data raised | &&
                     |{ lx_read->get_text( ) }|.
            RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
              EXPORTING message = lv_msg.
        ENDTRY.

        IF ls_deep-bcsetid IS INITIAL.
          lv_msg = |The request carries no BcsetId.|.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING message = lv_msg.
        ENDIF.

        IF ls_deep-deploytableset IS INITIAL.
          " Either the body really is empty, or the navigation property is
          " spelled differently than the component in ty_deep. Say both,
          " because the second is far more likely and has no other symptom.
          " Confirmed from the real $metadata: it must be "DeployTableSet".
          lv_msg = |No tables arrived. Check that the body nests the child | &&
                   |collection under "DeployTableSet", spelled exactly as | &&
                   |the navigation property on DeployRequest.|.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING message = lv_msg.
        ENDIF.

*&--- 2. walk the three levels into one flat value list -------------------
*&   The table name and record number are taken from the level that owns
*&   them, falling back downwards, so a caller that fills the keys only
*&   where they belong still works.
        LOOP AT ls_deep-deploytableset INTO DATA(ls_tab).

          LOOP AT ls_tab-deployrowset INTO DATA(ls_row).

            lv_tab = ls_tab-tablename.
            IF lv_tab IS INITIAL.
              lv_tab = ls_row-tablename.
            ENDIF.

            lv_rec = ls_row-recnumber.

            LOOP AT ls_row-deployfieldset INTO DATA(ls_fld).

              CLEAR ls_value.

              ls_value-tabname = lv_tab.
              IF ls_value-tabname IS INITIAL.
                ls_value-tabname = ls_fld-tablename.
              ENDIF.

              ls_value-recnumber = lv_rec.
              IF ls_value-recnumber IS INITIAL.
                ls_value-recnumber = ls_fld-recnumber.
              ENDIF.

              " DeployField calls the field name "Name", not "FieldName".
              ls_value-fieldname = ls_fld-name.
              ls_value-value     = ls_fld-value.

              " The source's maintenance view for this table (e.g. V_T001
              " for T001) - only known at DeployTable level, so it comes
              " from ls_tab, not ls_row/ls_fld. Carried on every value row
              " so the worker can register the real object per table
              " (R3TR VDAT <view>) instead of a guess.
              ls_value-viewname = ls_tab-viewname.

              IF ls_value-tabname IS INITIAL OR ls_value-fieldname IS INITIAL.
                lv_msg = |A posted value has no table name or no field name. | &&
                         |Every DeployField needs Tablename and Name.|.
                RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
                  EXPORTING message = lv_msg.
              ENDIF.

              APPEND ls_value TO lt_values.

            ENDLOOP.
          ENDLOOP.
        ENDLOOP.

        IF lt_values IS INITIAL.
          lv_msg = |The tables arrived but carry no fields. Check the | &&
                   |"DeployRowSet" and "DeployFieldSet" navigation property names.|.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING message = lv_msg.
        ENDIF.

*&--- 3. normalise the Activate flag ---------------------------------------
*&   DeployRequest's property is Activate (confirmed by the user directly,
*&   2026-09-13 - LS_DEEP-ACTIVATE, not LS_DEEP-ACTIVITY; a stretch of this
*&   project wrongly believed the reverse and this line, and the studio's
*&   matching wire property, were incorrectly "fixed" back and forth
*&   several times as a result). Whatever DDIC type backs it is not
*&   necessarily abap_bool, and an IMPORTING parameter passed by reference
*&   demands a COMPATIBLE type, not merely a convertible one — hence
*&   "LS_DEEP-ACTIVATE is not type-compatible with formal parameter
*&   IV_ACTIVATE". Going through a string works whatever the property is,
*&   and also copes with a gateway that delivers the word "true" because
*&   the property is Edm.String underneath rather than Edm.Boolean.
*&
*&   CONV abap_bool( ... ) would compile but is a trap: it truncates, so
*&   "true" would become "t", which is not abap_true, and activation would
*&   silently never happen.
        lv_flag = ls_deep-activate.
        CONDENSE lv_flag.
        TRANSLATE lv_flag TO UPPER CASE.

        IF lv_flag = 'X' OR lv_flag = 'TRUE' OR lv_flag = '1' OR lv_flag = 'Y'.
          lv_activate = abap_true.
        ELSE.
          lv_activate = abap_false.
        ENDIF.

*&--- 3b. SOURCE E071/E071K PROVENANCE -------------------------------
*&   The Gold payload contains the selected values, while SourceE071Json
*&   carries the source system's real E071/E071K rows. The worker uses
*&   those source rows only to register the exact transport objects/keys
*&   on the target task. It does NOT derive keys on the target and does
*&   NOT replace the selected DeployTableSet value payload.
        CLEAR: lt_source_e071, lt_source_recattr.

        IF ls_deep-sourcee071json IS NOT INITIAL.
          TRY.
              /ui2/cl_json=>deserialize(
                EXPORTING
                  json = ls_deep-sourcee071json
                CHANGING
                  data = lt_source_e071 ).
            CATCH cx_root INTO DATA(lx_source_e071).
              lv_msg = |SourceE071Json could not be parsed: { lx_source_e071->get_text( ) }|.
              RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
                EXPORTING message = lv_msg.
          ENDTRY.
        ENDIF.

        IF ls_deep-sourcerecattrjson IS NOT INITIAL.
          TRY.
              /ui2/cl_json=>deserialize(
                EXPORTING
                  json = ls_deep-sourcerecattrjson
                CHANGING
                  data = lt_source_recattr ).
            CATCH cx_root INTO DATA(lx_source_recattr).
              lv_msg = |SourceRecAttrJson could not be parsed: { lx_source_recattr->get_text( ) }|.
              RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
                EXPORTING message = lv_msg.
          ENDTRY.
        ENDIF.

        IF lt_source_e071 IS INITIAL.
          lv_msg = |No source E071/E071K metadata arrived. SourceE071Json is empty in the posted DeployRequest. | &&
                  |The target will not guess E071K TABKEYs. Rebuild the Gold deployment payload from the Bronze source metadata and retry.|.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              message           = lv_msg
              message_unlimited = lv_msg.
        ENDIF.

*&--- 4. hand it to the worker ----------------------------------------------
        DATA(ls_result) = zcl_im_bcset_deploy=>deploy_bcset(
                            iv_bcset_id       = CONV scpr_id( ls_deep-bcsetid )
                            iv_bcset_text     = CONV scpr_text( ls_deep-bcsettext )
                            iv_target_cli     = CONV symandt( ls_deep-targetcli )
                            iv_trkorr         = CONV trkorr( ls_deep-trkorr )
                            iv_activate       = lv_activate
                            it_values         = lt_values
                            it_source_e071    = lt_source_e071
                            it_source_recattr = lt_source_recattr ).

*&--- 5. answer with what was actually done ---------------------------------
*&   DeployRequest's properties: BcsetId, BcsetText, TargetCli, Trkorr,
*&   Activate, Status, Records, SourceE071Json, SourceRecAttrJson. Only
*&   Status and Records are filled here - CORRESPONDING #( ls_deep ) just
*&   echoes the rest (SourceE071Json/SourceRecAttrJson included) back the
*&   way they arrived.
        ls_resp           = CORRESPONDING #( ls_deep ).
        ls_resp-trkorr    = ls_result-trkorr.
        ls_resp-targetcli = ls_result-client.
        ls_resp-status    = ls_result-status.
        ls_resp-records   = ls_result-records.

        " Wrapped in TRY/CATCH cx_root for the same reason as step 1: this
        " is the last unprotected call in the whole chain. If the response
        " structure does not match what the framework expects here, this
        " is the other place a blank /IWFND/CX_MGW_BUSI_EXCEPTION with no
        " text and no ST22 dump could be coming from - and by this point
        " deploy_bcset has already run, so the BC Set may already exist.
        TRY.
            copy_data_to_ref( EXPORTING is_data = ls_resp
                              CHANGING  cr_data = er_deep_entity ).
          CATCH cx_root INTO DATA(lx_resp).
            lv_msg = |BC Set { ls_deep-bcsetid } was processed (status { ls_result-status }) | &&
                     |but the response could not be built - copy_data_to_ref raised | &&
                     |{ lx_resp->get_text( ) }|.
            RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
              EXPORTING message = lv_msg.
        ENDTRY.

      WHEN OTHERS.

        super->/iwbep/if_mgw_appl_srv_runtime~create_deep_entity(
          EXPORTING
            iv_entity_name          = iv_entity_name
            iv_entity_set_name      = iv_entity_set_name
            iv_source_name          = iv_source_name
            it_key_tab              = it_key_tab
            it_navigation_path      = it_navigation_path
            io_expand               = io_expand
            io_tech_request_context = io_tech_request_context
            io_data_provider        = io_data_provider
          IMPORTING
            er_deep_entity          = er_deep_entity ).

    ENDCASE.

  ENDMETHOD.


*&=====================================================================*
*& NOTES
*&=====================================================================*
*&
*& copy_data_to_ref is inherited from /IWBEP/CL_MGW_ABS_DATA. It is
*& protected, which is why the response is assembled here in the DPC_EXT
*& rather than in the worker class.
*&
*& RECNUMBER: confirmed Edm.String on both DeployRow and DeployField. The
*& studio now sends it quoted ("Recnumber": "1"). No ABAP change was needed
*& for this: LV_REC is TYPE I, and assigning a numeric string into it
*& converts automatically on a plain MOVE.
*&
*& Class prefix: if your SEGW project were not called ZIM_BCSET_DEPLOY the
*& generated prefix would differ; yours matches, so every
*& zcl_zim_bcset_deploy_mpc=> reference above is correct as written.
*&
*&---------------------------------------------------------------------*
*& SMOKE TEST — /IWFND/GW_CLIENT on the target
*&
*& You already proved GET /$metadata works (200, full EDMX). This is the
*& next step: a deep insert that only stages, never activates.
*&
*&   POST /sap/opu/odata/sap/ZIM_BCSET_DEPLOY_SRV/DeployRequestSet
*&   Content-Type: application/json
*&   x-csrf-token: <fetched from a GET on the service root first>
*&
*&   {
*&     "BcsetId":   "ZTEST_DEPLOY_001",
*&     "BcsetText": "deep insert smoke test",
*&     "TargetCli": "",
*&     "Trkorr":    "",
*&     "Activate":  "false",
*&     "DeployTableSet": [
*&       {
*&         "BcsetId":   "ZTEST_DEPLOY_001",
*&         "Tablename": "TKA01",
*&         "Viewname":  "TKA01",
*&         "DeployRowSet": [
*&           {
*&             "BcsetId":   "ZTEST_DEPLOY_001",
*&             "Tablename": "TKA01",
*&             "Recnumber": "1",
*&             "DeployFieldSet": [
*&               { "BcsetId": "ZTEST_DEPLOY_001", "Tablename": "TKA01",
*&                 "Recnumber": "1", "Name": "KOKRS", "Value": "1000" }
*&             ]
*&           }
*&         ]
*&       }
*&     ]
*&   }
*&
*& Expect 201 with Status "STAGED" and a Trkorr. Then check SCPR20 for
*& ZTEST_DEPLOY_001 and SE09 for the request. Activate: false means the
*& configuration itself is untouched, so this is safe to run first.
*&
*& SourceE071Json and SourceRecAttrJson are both deliberately omitted
*& above - they are optional, and the worker class falls back to deriving
*& E071/E071K itself and leaving record attributes blank (rather than the
*& old hardcoded 'X') when either is absent, exactly as it always has.
*&
*& When it fails the HTTP body is usually generic. The real message is in
*& /IWFND/ERROR_LOG on the target. Check there first, every time.
*&
*&---------------------------------------------------------------------*
*& FALLBACK — dropping the super-> call
*&
*& Only if the class and the redefinition are both confirmed correct and
*& super-> still will not compile. Replace the whole WHEN OTHERS branch
*& with:
*&
*&     WHEN OTHERS.
*&       RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception
*&         EXPORTING textid = /iwbep/cx_mgw_tech_exception=>internal_error.
*&
*& What you lose: deep inserts into any OTHER entity set of this service
*& stop working. In ZIM_BCSET_DEPLOY_SRV there are none — DeployRequestSet
*& is the only set anything is ever posted to — so for this service the
*& cost is nothing today. It becomes a real loss the moment you add a
*& second postable entity set, so leave a comment saying why it is there.
*&
*& Do NOT reach for this to silence the error while the method is in the
*& wrong class. It would compile, activate, and never be called by
*& Gateway — a POST would return 405 or a "not implemented" error and you
*& would have nothing to debug.
*&
