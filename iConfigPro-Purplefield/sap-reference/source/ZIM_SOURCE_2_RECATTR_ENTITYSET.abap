*&---------------------------------------------------------------------*
*& ZIM_SOURCE_2_RECATTR_ENTITYSET — new entity set on the SOURCE service
*&
*& This is for ZIM_BCSET_ODATA_SRV — the SOURCE system's read service
*& (the one BCSetValueSet and BCSetE071RowSet already live on). It is NOT
*& for the target's ZIM_BCSET_DEPLOY_SRV.
*&
*& WHY THIS EXISTS
*&
*& SCPRRECA ("BC Set: BC Set record attributes") carries per-record
*& attributes that build_scprvals() on the target already writes via
*& SCPR_EXT_BCSET_WRITE's RECATTR parameter - but only ever with
*& TABLENAME/RECNUMBER/ACTIVITY populated, and ACTIVITY was being set to
*& a hardcoded 'X' rather than its real content. Confirmed via SE11 on
*& the source system: SCPRRECA-ACTIVITY's data element is DOKU_OBJ,
*& short text "Documentation Object" - a real reference (e.g.
*& "SIMG_CFMENUOLMEOMEB"), not a boolean flag. This is very likely where
*& SE09/SE01's "IMG Activity" column on a transport's object entry
*& ultimately traces back to.
*&
*& This entity set exposes SCPRRECA's real per-record attributes for a
*& given BC Set, so the target can carry the real Documentation Object
*& (and ObjectName/ObjectType/Uncomplete) through on deploy instead of
*& leaving them blank or wrong.
*&
*& ---------------------------------------------------------------------
*& HOW TO ADD THIS TO YOUR EXISTING ZIM_BCSET_ODATA_SRV PROJECT
*&
*& SEGW > your ZIM_BCSET_ODATA_SRV project > Data Model
*&
*& 1. Entity Type > Create > BCSetRecAttrRow
*&    Properties (all Edm.String, all Key except BcsetId/TabName which
*&    are also keys - BcsetId, TabName and RecNumber together are the
*&    natural key, matching SCPRRECA's own key):
*&      BcsetId     (Key)
*&      TabName     (Key)
*&      RecNumber   (Key)
*&      ObjectName
*&      ObjectType
*&      DocumentationObject   - source: SCPRRECA-ACTIVITY
*&      Uncomplete
*&
*& 2. Entity Set > Create, Entity Type BCSetRecAttrRow. SEGW names the
*&    set after the type by appending "Set" - BCSetRecAttrRowSet - the
*&    same pattern as BCSetE071Row/BCSetE071RowSet. CONFIRMED ON THE REAL
*&    SYSTEM (2026-09-12) that this IS the real entity set name - a
*&    direct GET against /BCSetRecAttrRowSet works.
*&
*&    The GENERATED ABAP METHOD NAME is a different story: ABAP method
*&    identifiers are capped at 30 characters, and
*&    "BCSETRECATTRROWSET_GET_ENTITYSET" (33 chars) is 3 over that limit -
*&    so SAP truncates the entity-set-derived prefix to fit, dropping the
*&    trailing "ET" to leave BCSETRECATTRROWS_GET_ENTITYSET (30 chars
*&    exactly) as the real, generated method name. BCSetE071RowSet never
*&    hit this because "BCSETE071ROWSET_GET_ENTITYSET" is only 29 chars -
*&    just under the limit, no truncation needed there, which is why that
*&    one case's method name matched its entity set name directly and
*&    this one's does not. Confirmed from the real generated method list
*&    in the DPC_EXT (Methods > Inherited Methods).
*&
*& 3. Generate Runtime Objects.
*&
*& 4. On the generated _DPC_EXT class:
*&    Methods > Inherited Methods > find BCSETRECATTRROWS_GET_ENTITYSET
*&    (note: missing the final "ET" versus the entity set's own name -
*&    see the truncation note above; this IS the right method despite the
*&    name mismatch) > right-click > Redefine > paste the body below.
*&
*& 5. Activate. Test with a plain GET in a browser or /IWFND/GW_CLIENT:
*&      /sap/opu/odata/sap/ZIM_BCSET_ODATA_SRV/BCSetRecAttrRowSet
*&        ?$filter=BcsetId eq 'YOUR_BCSET_ID'
*&
*& ---------------------------------------------------------------------
*& Written mirroring ZIM_SOURCE_1_E071_ENTITYSET.abap's already-fixed
*& filter-reading pattern (IT_FILTER_SELECT_OPTIONS as a direct method
*& parameter, LV_MSG TYPE bapi_msg, MPC-class-qualified row type) rather
*& than guessing again - see that file's own header for why each of those
*& three things previously failed to activate on this system.
*& ---------------------------------------------------------------------

  METHOD bcsetrecattrrows_get_entityset.

*&--- 1. which BC Set was asked for -------------------------------------
    DATA: lv_bcset_id TYPE scpr_id,
          lv_msg      TYPE bapi_msg.

    READ TABLE it_filter_select_options
      WITH KEY property = 'BcsetId'
      INTO DATA(ls_filter).

    IF sy-subrc = 0.
      READ TABLE ls_filter-select_options
        INDEX 1
        INTO DATA(ls_option).
      IF sy-subrc = 0.
        lv_bcset_id = ls_option-low.
      ENDIF.
    ENDIF.

    IF lv_bcset_id IS INITIAL.
      lv_msg = |BCSetRecAttrRowSet needs $filter=BcsetId eq '...' - no BC Set was given.|.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message = lv_msg.
    ENDIF.

*&--- 2. read SCPRRECA directly for this BC Set --------------------------
*&   SCPRRECA is a flat transparent table (confirmed via SE11), not a
*&   cluster - a plain SELECT is the direct, supported way to read it,
*&   the same way build_scprvals() on the target writes it directly via
*&   SCPR_EXT_BCSET_WRITE's RECATTR parameter rather than through any
*&   wrapping function.
    DATA: lt_recattr TYPE STANDARD TABLE OF scprreca WITH DEFAULT KEY.

    SELECT * FROM scprreca
      INTO TABLE lt_recattr
      WHERE id      = lv_bcset_id
        AND version = 'N'.

*&--- 3. flatten into the row set -----------------------------------------
    DATA: ls_row TYPE zcl_zim_bcset_odata_01_mpc=>ts_bcsetrecattrrow.
    CLEAR et_entityset.

    LOOP AT lt_recattr INTO DATA(ls_recattr).
      CLEAR ls_row.
      ls_row-bcsetid             = lv_bcset_id.
      ls_row-tabname             = ls_recattr-tablename.
      ls_row-recnumber           = ls_recattr-recnumber.
      ls_row-objectname          = ls_recattr-objectname.
      ls_row-objecttype          = ls_recattr-objecttype.
      ls_row-documentationobject = ls_recattr-activity.   " ACTIVITY = Documentation Object, confirmed via SE11
      ls_row-uncomplete          = ls_recattr-uncomplete.
      APPEND ls_row TO et_entityset.
    ENDLOOP.

    IF io_tech_request_context IS BOUND AND
       io_tech_request_context->has_inlinecount( ) = abap_true.
      es_response_context-inlinecount = lines( et_entityset ).
    ENDIF.

  ENDMETHOD.

*&---------------------------------------------------------------------*
*& IF zcl_zim_bcset_odata_01_mpc IS NOT YOUR MPC CLASS'S NAME, OR IF THE
*& GENERATED TYPE IS NOT TS_BCSETRECATTRROW
*&
*& Same note as ZIM_SOURCE_1_E071_ENTITYSET.abap: this name was read
*& directly off BCSETVALUESET_GET_ENTITYSET's own working code on your
*& system. BCSetRecAttrRow lives on the same ZIM_BCSET_ODATA_SRV service,
*& so its MPC class is the same one - but the TS_ type name follows
*& whatever you named the entity type, so check SE11/the MPC class if
*& "ts_bcsetrecattrrow" does not activate.
*&---------------------------------------------------------------------*
