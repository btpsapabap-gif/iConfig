*&---------------------------------------------------------------------*
*& ZIM_SOURCE_1_E071_ENTITYSET — new entity set on the SOURCE service
*&
*& This is for ZIM_BCSET_ODATA_SRV — the SOURCE system's read service
*& (the one BCSetValueSet already lives on). It is NOT for the target's
*& ZIM_BCSET_DEPLOY_SRV — those are the ZIM_DEPLOY_* files, a different
*& system, a different service. Do not confuse the two.
*&
*& WHY THIS EXISTS
*&
*& Deploying a BC Set to the target needs to register the real customizing
*& objects it touches in the target's transport - R3TR VDAT V_T001 for a
*& table read through a maintenance view, R3TR TABU for one read directly,
*& and so on, each with its own E071K key entries (one per actual
*& customizing record - confirmed via SE16 on this system: for T001,
*& client 200 + company code 1000 concatenates to E071K's key value
*& "2001000"). The target used to DERIVE these itself, on the target, after
*& writing the BC Set there - which meant guessing between candidate object
*& types before that write could even be attempted (SCP1, then VDAT/TDAT,
*& neither the full story - see ZIM_DEPLOY_2's header for that history).
*&
*& SCPR_BCSET_DATA_TO_E071 is the function that derives this correctly -
*& and it can be called right here, on THIS system, where the BC Set
*& already exists, instead of on the target after an as-yet-unwritten BC
*& Set. This entity set exposes exactly that: call it for a given BC Set,
*& return what it says. The target then replays those same entries with
*& its own transport number substituted in, instead of deriving anything
*& itself.
*&
*& ---------------------------------------------------------------------
*& HOW TO ADD THIS TO YOUR EXISTING ZIM_BCSET_ODATA_SRV PROJECT
*&
*& SEGW > your ZIM_BCSET_ODATA_SRV project > Data Model
*&
*& 1. Entity Type > Create > BCSetE071Row
*&    Properties (all Edm.String except Seq):
*&      BcsetId   (Key)
*&      Seq       (Key, Edm.Int32) - a running number; nothing else here
*&                is guaranteed unique per row
*&      Trkorr
*&      Pgmid
*&      Object
*&      ObjName
*&      TabKey    - blank for a plain E071 row (one per table/view
*&                  object); the concatenated key value for an E071K row
*&                  (one per actual customizing record under that object)
*&      Activity  - E071-ACTIVITY itself (standard SAP field, own DDIC
*&                  type, NOT SCPRRECA-ACTIVITY/Documentation Object -
*&                  see the note below on why this was added). Blank on
*&                  every E071K row - only E071 (the header, one per
*&                  object) carries this field on the real table.
*&      MasterType,
*&      MasterName - E071K-MASTERTYPE / E071K-MASTERNAME (added
*&                  2026-09-13 - see the note further below). Real
*&                  fields on the standard E071K table itself, recording
*&                  which OTHER object (typically a maintenance view,
*&                  e.g. VDAT W_T024W_ASSIGN) a given key row was
*&                  actually entered through. Blank on every E071 header
*&                  row - only E071K carries these.
*&      ViewName  - E071K-VIEWNAME (added 2026-09-13 - see the note
*&                  further below). A SEPARATE real field from
*&                  MasterType/MasterName, not the same fact under a
*&                  second name - confirmed via direct source SE16 on
*&                  R3TR CDAT VC_T001L: that row's real MasterName is
*&                  "VC_T001L" (the CDAT cluster itself) but its real
*&                  ViewName is "V_T001L" (the specific maintenance view
*&                  actually used to enter it). Blank on every E071
*&                  header row - only E071K carries this.
*&
*& 2. Entity Set > Create — let SEGW default the name from the entity
*&    type (append "Set"): BCSetE071RowSet, Entity Type BCSetE071Row.
*&    (Confirmed on the real system: SEGW names the set after the type,
*&    not "BCSetE071Set" — the generated GET_ENTITYSET method is
*&    BCSETE071ROWSET_GET_ENTITYSET, so the resource path is
*&    /BCSetE071RowSet, not /BCSetE071Set. The studio's
*&    fetchBcSetE071Rows() calls /BCSetE071RowSet to match.)
*&
*& 3. Generate Runtime Objects.
*&
*& 4. On the generated _DPC_EXT class:
*&    Methods > Inherited Methods > find BCSETE071ROWSET_GET_ENTITYSET >
*&    right-click > Redefine > paste the body below.
*&
*& 5. Activate. Test with a plain GET in a browser or /IWFND/GW_CLIENT:
*&      /sap/opu/odata/sap/ZIM_BCSET_ODATA_SRV/BCSetE071RowSet
*&        ?$filter=BcsetId eq 'YOUR_BCSET_ID'
*&
*& ---------------------------------------------------------------------
*& Fixed against real activation errors (this system, this project):
*&   - Filter reading now mirrors BCSETVALUESET_GET_ENTITYSET's own,
*&     already-working pattern exactly: IT_FILTER_SELECT_OPTIONS is a
*&     direct importing parameter of the redefined GET_ENTITYSET method
*&     on this release — no IO_TECH_REQUEST_CONTEXT->GET_FILTER( ) /
*&     /IWBEP/S_COD_SELECT_OPTION indirection needed or available here.
*&   - LV_MSG is TYPE BAPI_MSG, not TYPE STRING — matches the type this
*&     project's other /IWBEP/CX_MGW_BUSI_EXCEPTION-raising code already
*&     uses for its MESSAGE parameter (see ZIM_DEPLOY_2*).
*&   - The row structure is addressed via the MPC class's generated TS_
*&     type (zcl_zim_bcset_odata_01_mpc=>ts_bcsete071row), the same way
*&     BCSETVALUESET_GET_ENTITYSET already addresses TS_BCSETVALUE — not
*&     a bare global structure name (that guess didn't exist).
*& ---------------------------------------------------------------------
*& ADDED 2026-09-13: E071-ACTIVITY (the field behind the "IMG Activity"
*& column on a transport's object entry) was NEVER captured by this
*& entity set - only PGMID/OBJECT/OBJNAME/TABKEY were read off
*& LT_E071/LT_E071K, even though SCPR_BCSET_DATA_TO_E071's own output
*& table LT_E071 is TYPE STANDARD TABLE OF E071 and so already carries a
*& real ACTIVITY value per object whenever one exists. Round 1 of this
*& project chased a different field for this (SCPRRECA-ACTIVITY, a
*& Documentation Object reference on the BC-Set record itself - see
*& ZIM_SOURCE_2_RECATTR_ENTITYSET.abap) and mirrored that instead - it may
*& still be related conceptually, but the field that actually lands on
*& the transport's own object entry is E071-ACTIVITY, on E071 itself, and
*& this entity set was silently dropping it the whole time. Now captured
*& below. E071K carries no such field on the real table - only E071 (one
*& row per object) does - so E071K rows leave Activity blank.
*& ---------------------------------------------------------------------
*& ADDED 2026-09-13: E071K-MASTERTYPE / E071K-MASTERNAME were never
*& captured either - real fields on the standard E071K table (this
*& method already types LS_E071K off the genuine DDIC structure e071k,
*& so they exist there already; only the flatten loop below was
*& dropping them). The user's own direct field-by-field spec for a real
*& key row on transport S4DK900649 named them explicitly:
*&   ls_e071k-pgmid = R3TR, object = TABU, objname = T024W,
*&   ls_e071k-mastertype = VDAT, ls_e071k-mastername = W_T024W_ASSIGN,
*&   ls_e071k-tabkey = 20000010001
*& i.e. a key entered against the real table (R3TR TABU T024W) but
*& recording that it was actually entered THROUGH the maintenance view
*& W_T024W_ASSIGN. This is a distinct fact from the VDAT object's own
*& separate header/key entries (already mirrored, confirmed live via
*& SE09 screenshots and direct SE16 export) - both can and do coexist.
*& Now captured below, on E071K rows only (E071 has no such field).
*& ---------------------------------------------------------------------
*& ADDED 2026-09-13 (same day, after live testing found MasterType/
*& MasterName alone were not the whole story): E071K-VIEWNAME is a
*& SEPARATE real field from MASTERTYPE/MASTERNAME - not the same fact
*& under a second name. Confirmed directly via source SE16 on
*& R3TR CDAT VC_T001L: MASTERNAME on that row is "VC_T001L" (the CDAT
*& cluster object itself) but VIEWNAME is "V_T001L" (the specific
*& maintenance view actually used to enter that key) - two different
*& values. The user's own field-by-field correction named it explicitly
*& alongside MASTERTYPE/MASTERNAME for the W_T024W_ASSIGN case (where
*& MasterName and Viewname happen to be the same string, since the
*& master IS the view there) - this entity set was capturing
*& MASTERTYPE/MASTERNAME but still dropping VIEWNAME entirely. Now
*& captured below, on E071K rows only (E071 has no such field).
*& ---------------------------------------------------------------------

  METHOD bcsete071rowset_get_entityset.

*&--- 1. which BC Set was asked for -------------------------------------
*&   Same pattern BCSETVALUESET_GET_ENTITYSET already uses to scope by
*&   BCSetID — IT_FILTER_SELECT_OPTIONS is already a parameter of this
*&   method, read directly, no IO_TECH_REQUEST_CONTEXT needed for this.
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
      lv_msg = |BCSetE071RowSet needs $filter=BcsetId eq '...' - no BC Set was given.|.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message = lv_msg.
    ENDIF.

*&--- 2. derive the real objects, on THIS system, right now -------------
    DATA: lt_e071  TYPE STANDARD TABLE OF e071  WITH DEFAULT KEY,
          lt_e071k TYPE STANDARD TABLE OF e071k WITH DEFAULT KEY.

    CALL FUNCTION 'SCPR_BCSET_DATA_TO_E071'
      EXPORTING
        bcset_id                = lv_bcset_id
        category                = ''
        resolve_hier            = abap_true
      TABLES
        e071                    = lt_e071
        e071k                   = lt_e071k
      EXCEPTIONS
        bcset_dont_exist        = 1
        bcset_is_empty          = 2
        bcset_internal_error    = 3
        wrong_ddic_informations = 4
        OTHERS                  = 5.
    IF sy-subrc <> 0.
      lv_msg = |BC Set { lv_bcset_id } - SCPR_BCSET_DATA_TO_E071 rc={ sy-subrc }.|.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING message = lv_msg.
    ENDIF.

*&--- 3. flatten both into one row set -----------------------------------
*&   E071: one row per object (table/view). E071K: one row per key entry
*&   under that object (one per actual customizing record) - TabKey tells
*&   the two apart on the way out.
    DATA: ls_row TYPE zcl_zim_bcset_odata_01_mpc=>ts_bcsete071row,
          lv_seq TYPE i.

    CLEAR et_entityset.

    LOOP AT lt_e071 INTO DATA(ls_e071).
      lv_seq = lv_seq + 1.
      CLEAR ls_row.
      ls_row-bcsetid  = lv_bcset_id.
      ls_row-seq      = lv_seq.
      ls_row-trkorr   = ls_e071-trkorr.
      ls_row-pgmid    = ls_e071-pgmid.
      ls_row-object   = ls_e071-object.
      ls_row-objname  = ls_e071-obj_name.
      ls_row-tabkey   = ''.
      ls_row-activity = ls_e071-activity.   " E071-ACTIVITY, real field on the standard table - see header note
      APPEND ls_row TO et_entityset.
    ENDLOOP.

    LOOP AT lt_e071k INTO DATA(ls_e071k).
      lv_seq = lv_seq + 1.
      CLEAR ls_row.
      ls_row-bcsetid  = lv_bcset_id.
      ls_row-seq      = lv_seq.
      ls_row-trkorr   = ls_e071k-trkorr.
      ls_row-pgmid    = ls_e071k-pgmid.
      ls_row-object   = ls_e071k-object.
      ls_row-objname  = ls_e071k-objname.
      ls_row-tabkey   = ls_e071k-tabkey.
      ls_row-mastertype = ls_e071k-mastertype.   " which object this key was actually entered through - see header note
      ls_row-mastername = ls_e071k-mastername.
      ls_row-viewname   = ls_e071k-viewname.      " the real maintenance view - a SEPARATE field from mastertype/mastername, see header note
      APPEND ls_row TO et_entityset.
    ENDLOOP.

    IF io_tech_request_context IS BOUND AND
       io_tech_request_context->has_inlinecount( ) = abap_true.
      es_response_context-inlinecount = lines( et_entityset ).
    ENDIF.

  ENDMETHOD.

*&---------------------------------------------------------------------*
*& IF zcl_zim_bcset_odata_01_mpc IS NOT YOUR MPC CLASS'S NAME
*&
*& That name was read directly off BCSETVALUESET_GET_ENTITYSET's own
*& working code on your system (ls_entity TYPE
*& zcl_zim_bcset_odata_01_mpc=>ts_bcsetvalue) - since BCSetE071Row lives
*& on the same ZIM_BCSET_ODATA_SRV service, its MPC class is the same
*& one. If yours differs, use TS_BCSETE071ROW off whatever that same
*& class is.
*&---------------------------------------------------------------------*
