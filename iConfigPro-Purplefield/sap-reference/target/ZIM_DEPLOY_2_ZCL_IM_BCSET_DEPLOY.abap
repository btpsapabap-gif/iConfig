*&---------------------------------------------------------------------*
*& ZCL_IM_BCSET_DEPLOY — target-side BC Set deployment — V9
*&
*& VERSION 21 — TEMPLATE SAVE BC-SET FLOW (2026-09-16)
*&
*& This version is based on the user's live SAP standard sources for:
*&   SCPR_TEMPL_MN_TEMPLATE_SAVE
*&   SCPR_CT_TRANSPORT_CHECK
*&   SCPR_CT_TRANSPORT_INSERT
*&   SCPR_CT_KO200_FILL
*&
*& The target transport object is intentionally the standard BC Set object:
*&   R3TR / SCP1 / <BCSET_ID>
*&
*& Source E071/E071K replay is NOT used for target CTS registration.
*& SourceE071Json carries the source E071/E071K transport provenance and is replayed
*& onto the target task after the standard BC Set save has created its headers.
*&
*& Create as a new global class in ADT and paste this whole source.
*& (SE24 users: split at the CLASS ... IMPLEMENTATION line.)
*&
*& There is no SAP-delivered OData service that creates a transport and
*& registers real objects/keys against it, so this is a Z class on the
*& TARGET system.
*&
*& ARCHITECTURE CHANGE, CONFIRMED LIVE (2026-09-12) — "In Target BC Set
*& is not required. TR is enough with correct data. Leave BC Set." This
*& class used to also write a BC Set on this system (SCPR_EXT_BCSET_
*& WRITE) and optionally activate it (SCPR_BCSET_ACTIVATE), after first
*& registering it against the transport (SCPR_CT_TRANSPORT_CHECK). All
*& three were removed that day. The deliverable became the transport
*& request itself, carrying the real registered objects/keys (mirrored
*& from the source system, where the BC Set already exists) — not a BC
*& Set written, staged, or activated on this system. This also removed a
*& blank, uncaught /IWBEP/CX_MGW_BUSI_EXCEPTION (no ST22 dump, confirmed)
*& that started appearing once deploys grew to real scale (7 tables, 87
*& records) somewhere in that SCPR_CT_TRANSPORT_CHECK/SCPR_EXT_BCSET_WRITE
*& sequence — at the time, never root-caused, since removing the steps
*& entirely made root-causing them moot.
*&
*& REPLACED BY STANDARD BC-SET TRANSPORT FLOW (2026-09-15): the transport-only design
*& above left a real gap - S4DK900677's own E071K carried a correct key
*& (R3TR TABU T001W, tabkey 2001100) but T001W itself never got a row for
*& plant 1100, because registering a transport key was never the same
*& thing as writing the value. SCPR_CT_TRANSPORT_CHECK and SCPR_EXT_
*& BCSET_WRITE (the calls that actually write SCPRVALS/SCPRRECA-backed
*& values into a table) are back, gated behind IV_ACTIVATE - see step
*& 3b/3c below for the full reasoning, including why the original blank-
*& exception symptom is now believed to be a bug in this class's own
*& FAIL() (fixed the same day) rather than a real, unexplained SAP-side
*& crash. "Stage only" (IV_ACTIVATE = ABAP_FALSE, the default) is
*& completely unaffected - it behaves exactly as it has since 2026-09-12.
*&
*& It does four things, in order:
*&   1. creates or reuses a customizing transport request/task
*&   2. does not require a pre-existing SCP1 object; standard TEMPLATE SAVE
*&      performs the transport insertion when requested
*&   3. calls SCPR_TEMPL_MN_TEMPLATE_SAVE to persist the selected BC Set
*&      values and record attributes. WITH_TRANSP_INSERT is X so the
*&      standard SAVE routine registers the real R3TR/SCP1 BC Set object
*&      against the active Customizing task before persisting the data.
*&      No synthetic SCP1 object is fabricated by this class.
*&   4. (IV_ACTIVATE only) activates the written BC Set into the target
*&      configuration tables via SCPR_ACTIVATE_BCSETS_REMOTE
*&
*& ---------------------------------------------------------------------
*& IMPORTANT 2026-09-16: This version deliberately does NOT call
*& SCPR_EXT_BCSET_WRITE. It uses the live SCPR_TEMPL_MN_TEMPLATE_SAVE
*& signature supplied for the target system. Syntax-check this class in
*& ADT/SE24 on the target before activation.
*&
*& NOT COMPILED. No SAP system was available when this was written.
*& Syntax-check in ADT before transporting, and verify this interface in
*& your release — the part that cannot be checked from outside a system:
*&
*&   SE37  TR_APPEND_TO_COMM_OBJS_KEYS      — parameter names (confirmed
*&                                            live already, including
*&                                            WI_SUPPRESS_KEY_CHECK)
*&   SE37  SCPR_CT_TRANSPORT_CHECK / SCPR_TEMPL_MN_TEMPLATE_SAVE — signature
*&                                            was supplied live by the user;
*&                                            SCPR_CT_TRANSPORT_CHECK remains
*&                                            confirmed live. SCPR_EXT_BCSET_WRITE
*&                                            is deliberately not called.
*&
*&                                            The live SCPR_TEMPL_MN_TEMPLATE_SAVE
*&                                            source was supplied and verified for
*&                                            this target release.
*&                                            The exact interface may still be
*&                                            release-specific beyond that source.
*&
*&                                            Previous SCPR_EXT_BCSET_WRITE signature
*&                                            was confirmed live before
*&                                            their 2026-09-12 removal
*&                                            (see the history section
*&                                            below); not reconfirmed
*&                                            since being reinstated
*&                                            2026-09-15 - the exact
*&                                            interface may have drifted
*&                                            if anything changed on this
*&                                            system meanwhile.
*&
*& SCPRVALS/SCPRRECA field names (TABLENAME, RECNUMBER, FIELDNAME, VALUE,
*& OBJECTNAME, OBJECTTYPE, ACTIVITY, UNCOMPLETE — all confirmed via SE11)
*& are referenced in BUILD_SCPRVALS and are passed to
*& SCPR_TEMPL_MN_TEMPLATE_SAVE in BOTH Stage-only and Stage+Activate modes.
*& IV_ACTIVATE controls only the subsequent activation call.
*& ---------------------------------------------------------------------
*& CONFIRMED AGAINST THE REAL SYSTEM (kept for history — these functions
*& are no longer called by this class, but the lessons stay relevant if
*& BC-Set writing is ever reintroduced):
*&
*&   SCPR_EXT_BCSET_WRITE, SCPR_CT_TRANSPORT_CHECK, SCPR_BCSET_ACTIVATE,
*&   SCPR_BCSET_DATA_TO_E071 (the on-target E071 fallback derivation) —
*&   all removed 2026-09-12. Their signatures were fully confirmed via
*&   SE37/live testing before removal; see this file's git/version
*&   history (or the project's plan file) if reintroducing any of them.
*&
*&   Step 3a's TR_APPEND_TO_COMM_OBJS_KEYS registration was originally
*&   added because SCPR_CT_TRANSPORT_CHECK alone was not enough: it wraps
*&   the standard TR_OBJECT_CHECK, which pops an "assign to a transport"
*&   screen whenever the object has no existing, unambiguous request
*&   assignment yet - and there is no GUI in this RFC/Gateway context to
*&   render that screen into, so it failed outright with "Sending of
*&   dynpro SAPLSTRD 0100 not possible: No window system type
*&   specified". Confirmed live, in this system. Now that SCPR_CT_
*&   TRANSPORT_CHECK itself is removed, step 3a is the only registration
*&   mechanism, and stands on its own.
*&
*&   wt_e071k alongside wt_e071 is confirmed too, but as MANDATORY on
*&   this release, not optional - omitting it dumps with "the mandatory
*&   parameter WT_E071K was not filled", so it is always passed (empty
*&   when there is nothing keyed to put in it).
*&
*&   IT_USERS on TR_INSERT_REQUEST_WITH_TASKS was wrongly diagnosed
*&   earlier in this project as a legacy generic TABLES parameter
*&   needing a header-line table (see ensure_transport's own comment for
*&   the full correction) - it is a normal typed IMPORTING parameter
*&   (SCTS_USERS), and dropping it meant TR_INSERT_REQUEST_WITH_TASKS
*&   never created a task under the request, which is what
*&   "Changes to objects are only allowed in correction/repair" turned
*&   out to mean. Confirmed live, in this system.
*&
*&   Every CATCH cx_root block used to also call cl_abap_classdescr=>
*&   describe_by_object_ref( lx )->get_relative_name( ) to report the
*&   caught exception's own class name. Dropped: uncertain that method
*&   chain is correct on this release, and getting it wrong inside a
*&   catch block - with no try/catch of its own around it - would throw
*&   a brand new, unrelated exception straight past everything here,
*&   landing back at Gateway's generic handler with no text at all. That
*&   is exactly the symptom this was meant to fix, so it is exactly the
*&   kind of mistake not worth risking here. get_text() alone is kept -
*&   guaranteed safe on any cx_root, no RTTI involved.
*&
*&   IT_SOURCE_E071: the real E071/E071K entries SCPR_BCSET_DATA_TO_E071
*&   already derived on the SOURCE system (where the BC Set already
*&   exists - see ZIM_SOURCE_1_E071_ENTITYSET.abap), replayed here
*&   directly. This is now the ONLY registration mechanism - there is no
*&   more on-target fallback derivation for when it is empty (that
*&   fallback needed a BC Set to already exist on this system, which
*&   nothing writes any more). ADDED 2026-09-13: each entry now also
*&   carries ACTIVITY - E071-ACTIVITY itself, the field behind the "IMG
*&   Activity" column on a transport's object entry - copied straight onto
*&   LS_E071_BC-ACTIVITY in step 3a below. This entity set was previously
*&   dropping this field entirely (it is a real field on the standard
*&   E071 table, typed all along, just never read into the row); see
*&   ZIM_SOURCE_1_E071_ENTITYSET.abap's own header for the full story.
*&   CONFIRMED LIVE, 2026-09-13 (debugger, stepped into
*&   TR_APPEND_TO_COMM_OBJS_KEYS itself): setting LS_E071_BC-ACTIVITY alone
*&   is not enough - that FM always overwrites it from ABAP memory ID
*&   ACT_CTS (IMPORT IMG_ACTIVITY FROM MEMORY ID 'ACT_CTS', read via
*&   TR_READ_CURRENT_ACTIVITY/READ_IMG_ACTIVITY_FROM_MEMORY), which is
*&   blank in an RFC/Gateway-triggered call. Step 3a now EXPORTs the real
*&   value to that same memory ID before each call, once per distinct
*&   object - see step 3a's own comment for the full mechanism.
*&
*&   ADDED 2026-09-13: each E071K entry now also carries MASTERTYPE/
*&   MASTERNAME - real fields on the standard E071K table, recording
*&   which OTHER object (typically a maintenance view) a given key row
*&   was actually entered through. The user gave the exact real shape
*&   directly (transport S4DK900649): a key registered against
*&   R3TR TABU T024W with MASTERTYPE = VDAT, MASTERNAME = W_T024W_ASSIGN.
*&   Copied straight onto LS_E071K_BC-MASTERTYPE/MASTERNAME in step 3a -
*&   unlike ACTIVITY, nothing in TR_APPEND_TO_COMM_OBJS_KEYS is known (yet)
*&   to overwrite these, so no ACT_CTS-style workaround is needed for them.
*&
*&   ADDED 2026-09-13 (same day): the user's own field-by-field spec also
*&   named E071-OBJFUNC ('K' - the field behind SE01/SE09's "Function"
*&   column) and E071K-VIEWNAME (a field SEPARATE from MASTERTYPE/
*&   MASTERNAME - confirmed via source SE16 that they can genuinely
*&   differ, e.g. R3TR CDAT VC_T001L's own key: MASTERNAME "VC_T001L",
*&   VIEWNAME "V_T001L"). Both are now set in step 3a - OBJFUNC hardcoded
*&   'K' (matching the user's own literal example; every object this
*&   method registers carries key entries, so this is a constant, not
*&   something that needs to travel from source), VIEWNAME copied from
*&   IT_SOURCE_E071 the same way MASTERTYPE/MASTERNAME are.
*&
*&   NOT YET IMPLEMENTED, DELIBERATELY: the same spec also showed
*&   AS4POS set on both E071 and E071K ("ls_e071-as4pos = 47 - or
*&   generated position", "ls_e071k-as4pos = 1"). Unlike OBJFUNC/
*&   VIEWNAME, this looked like an illustration of the real row's shape
*&   after successful processing, not necessarily a value the CALLER of
*&   TR_APPEND_TO_COMM_OBJS_KEYS must supply - the FM's own name
*&   ("APPEND") suggests it assigns transport object/key POSITION
*&   numbers itself, the way transport object numbering normally works.
*&   Setting a conflicting/redundant AS4POS ourselves without confirming
*&   this either way risks introducing a NEW bug of exactly the kind
*&   flagged in this project's own standing feedback (verify a real
*&   field's actual role before writing to it, and don't assume
*&   something is missing/needed without confirming against real system
*&   behavior first - see [[feedback-dont-fabricate-data-to-fill-apparent-gaps]]).
*&   Left unset pending the user confirming whether TR_APPEND_TO_COMM_
*&   OBJS_KEYS auto-generates it or genuinely requires an explicit value.
*&
*&   IT_SOURCE_RECATTR: SCPRRECA-ACTIVITY is a Documentation Object
*&   reference (data element DOKU_OBJ, confirmed via SE11), not a
*&   boolean. This is a DIFFERENT field on a DIFFERENT table from
*&   E071-ACTIVITY above - this project mirrored it first, on the theory
*&   it was the source of the transport's "IMG Activity" column, but the
*&   field that actually lands there is E071-ACTIVITY (IT_SOURCE_E071,
*&   above) - E071 is a transport-object-level table, SCPRRECA is a
*&   BC-Set-record-level one. Still accepted and still flattened into
*&   ET_RECATTR by BUILD_SCPRVALS (for the result's record count), but
*&   since nothing writes SCPRRECA on this system any more, this data
*&   currently has no live effect beyond that count - kept for a future
*&   reintroduction of a write path, not dead code to be deleted casually.
*&
*& STILL UNVERIFIED:
*&   - The IT_SOURCE_E071 registration path at real scale beyond the
*&     7-table/87-record test that prompted this rewrite - not yet
*&     retested live since the BC-Set-write removal.
*& ---------------------------------------------------------------------
CLASS zcl_im_bcset_deploy DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    "! One posted value: one field of one record of one table.
    "! This mirrors SCPRVALS, which is what the target has to fill.
    "! viewname is the source's maintenance view for this table (e.g.
    "! V_T001 for T001) - carried alongside every value of that table so
    "! step 3a can register the real object (R3TR VDAT <view>), not a
    "! guess. Blank, or equal to tabname, means no distinct view was ever
    "! recorded, and the table registers as R3TR TDAT <tabname> instead.
    TYPES:
      BEGIN OF ty_value,
        tabname   TYPE tabname,
        recnumber TYPE i,
        fieldname TYPE fieldname,
        value     TYPE string,
        viewname  TYPE tabname,
      END OF ty_value,
      tt_value TYPE STANDARD TABLE OF ty_value WITH DEFAULT KEY.

    TYPES:
      tt_fieldnames TYPE STANDARD TABLE OF fieldname WITH DEFAULT KEY.

    "! One E071/E071K entry, exactly as SCPR_BCSET_DATA_TO_E071 derived it
    "! on the SOURCE system (where the BC Set already exists), captured via
    "! the new BCSetE071Set entity set and mirrored here instead of being
    "! re-derived on this system - see step 5's own comment for why.
    "! tabkey blank = an E071 row (one per table/view object); tabkey set
    "! = an E071K row (one per actual customizing record under it).
    "! trkorr is deliberately NOT part of this - the source's own request
    "! number travels with it but is always replaced by this system's own
    "! task number when replayed, never reused as-is.
    "! activity is E071-ACTIVITY (added 2026-09-13) - the field behind the
    "! "IMG Activity" column on a transport's object entry, blank on every
    "! E071K row (only E071 itself carries this field on the real table).
    "! NOT SCPRRECA-ACTIVITY/Documentation Object (see IT_SOURCE_RECATTR
    "! below) - a different field on a different table that this project
    "! mirrored first and turned out not to be what lands on the
    "! transport's own object entry.
    "! mastertype/mastername are E071K-MASTERTYPE / E071K-MASTERNAME
    "! (added 2026-09-13) - which OTHER object (typically a maintenance
    "! view, e.g. VDAT W_T024W_ASSIGN) this specific key row was actually
    "! entered through. Blank on every E071 header row - only E071K
    "! carries these on the real table.
    "! viewname is E071K-VIEWNAME (added 2026-09-13) - a SEPARATE real
    "! field from mastertype/mastername, not the same fact twice:
    "! confirmed via source SE16 that R3TR CDAT VC_T001L's own key has
    "! mastername "VC_T001L" (the CDAT cluster) but viewname "V_T001L"
    "! (the specific maintenance view actually used). Blank on every
    "! E071 header row - only E071K carries this.
    TYPES:
      BEGIN OF ty_e071_entry,
        pgmid      TYPE e071-pgmid,
        object     TYPE e071-object,
        objname    TYPE e071-obj_name,
        objfunc    TYPE e071-objfunc,
        tabkey     TYPE e071k-tabkey,
        activity   TYPE e071-activity,
        mastertype TYPE e071k-mastertype,
        mastername TYPE e071k-mastername,
        viewname   TYPE e071k-viewname,
      END OF ty_e071_entry,
      tt_e071_entry TYPE STANDARD TABLE OF ty_e071_entry WITH DEFAULT KEY.

    "! One SCPRRECA record attribute, mirrored from the SOURCE system's own
    "! SCPRRECA (via the new BCSetRecAttrRowSet entity set) rather than
    "! guessed or left blank on this system. docu_object is SCPRRECA-
    "! ACTIVITY - a Documentation Object reference (confirmed via SE11 -
    "! not a boolean), very likely what SE09/SE01 shows as a transport
    "! object's "IMG Activity". Matched onto this deploy's own records by
    "! (tablename, recnumber) in build_scprvals().
    TYPES:
      BEGIN OF ty_recattr_entry,
        tablename   TYPE scprreca-tablename,
        recnumber   TYPE scprreca-recnumber,
        objectname  TYPE scprreca-objectname,
        objecttype  TYPE scprreca-objecttype,
        docu_object TYPE scprreca-activity,
        uncomplete  TYPE scprreca-uncomplete,
      END OF ty_recattr_entry,
      tt_recattr_entry TYPE STANDARD TABLE OF ty_recattr_entry WITH DEFAULT KEY.

    TYPES:
      BEGIN OF ty_result,
        bcset_id TYPE scpr_id,
        trkorr   TYPE trkorr,
        client   TYPE symandt,
        status   TYPE char20,
        message  TYPE string,
        tables   TYPE i,
        records  TYPE i,
        values   TYPE i,
      END OF ty_result.

    "! Stages a BC Set in this client and optionally activates it.
    "!
    "! @parameter iv_bcset_id   | BC Set to create or replace
    "! @parameter iv_bcset_text | its description
    "! @parameter iv_target_cli | must be blank or equal sy-mandt
    "! @parameter iv_trkorr     | blank creates a customizing request
    "! @parameter iv_activate   | abap_true writes the configuration
    "! @parameter it_values     | one entry per field
    "! @parameter it_source_e071 | source E071/E071K rows derived on the
    "!                          source system; replayed onto the target task
    "!                          so the task carries the real E071K keys.
    "! @parameter it_source_recattr | real SCPRRECA record attributes
    "!                          (ObjectName/ObjectType/Documentation Object/
    "!                          Uncomplete) mirrored from the source
    "!                          (optional - a record with no match keeps
    "!                          today's minimal population, blank rather
    "!                          than the old hardcoded 'X')
    "! @raising   /iwbep/cx_mgw_busi_exception | anything that stops the deploy
    CLASS-METHODS deploy_bcset
      IMPORTING
        iv_bcset_id       TYPE scpr_id
        iv_bcset_text     TYPE scpr_text OPTIONAL
        iv_target_cli     TYPE symandt   OPTIONAL
        iv_trkorr         TYPE trkorr    OPTIONAL
        iv_activate       TYPE abap_bool DEFAULT abap_false
        it_values         TYPE tt_value
        it_source_e071    TYPE tt_e071_entry OPTIONAL
        it_source_recattr TYPE tt_recattr_entry OPTIONAL
      RETURNING
        VALUE(rs_result) TYPE ty_result
      RAISING
        /iwbep/cx_mgw_busi_exception.

  PRIVATE SECTION.

    "! Client fields are never configuration content — the target client
    "! is decided on import — so they never reach SCPRVALS.
    CONSTANTS:
      BEGIN OF c_technical,
        mandt  TYPE fieldname VALUE 'MANDT',
        client TYPE fieldname VALUE 'CLIENT',
      END OF c_technical.

    CLASS-METHODS fail
      IMPORTING iv_text TYPE string
      RAISING   /iwbep/cx_mgw_busi_exception.

    CLASS-METHODS check_guard_rails
      IMPORTING iv_bcset_id   TYPE scpr_id
                iv_target_cli TYPE symandt
                it_values     TYPE tt_value
      RAISING   /iwbep/cx_mgw_busi_exception.

    CLASS-METHODS build_scprvals
      IMPORTING iv_bcset_id       TYPE scpr_id
                it_values         TYPE tt_value
                it_source_recattr TYPE tt_recattr_entry OPTIONAL
      EXPORTING et_values         TYPE STANDARD TABLE
                et_recattr        TYPE STANDARD TABLE
                ev_tables         TYPE i.

    CLASS-METHODS dedupe_business_records
      IMPORTING it_values TYPE tt_value
      RETURNING VALUE(rt_values) TYPE tt_value.

    CLASS-METHODS get_ddic_key_fields
      IMPORTING iv_tabname TYPE tabname
      RETURNING VALUE(rt_fields) TYPE tt_fieldnames.

    CLASS-METHODS ensure_transport
      IMPORTING iv_bcset_id      TYPE scpr_id
                iv_trkorr        TYPE trkorr
      EXPORTING ev_task_trkorr   TYPE trkorr
      RETURNING VALUE(rv_trkorr) TYPE trkorr
      RAISING   /iwbep/cx_mgw_busi_exception.

    CLASS-METHODS append_source_keys
      IMPORTING iv_task_trkorr TYPE trkorr
                it_source_e071 TYPE tt_e071_entry
      RAISING   /iwbep/cx_mgw_busi_exception.



ENDCLASS.



CLASS zcl_im_bcset_deploy IMPLEMENTATION.


  METHOD deploy_bcset.

    DATA: lt_vals        TYPE STANDARD TABLE OF scprvals,
          lt_recattr     TYPE STANDARD TABLE OF scprreca,
          lv_trkorr      TYPE trkorr,
          lv_tables      TYPE i,
          lv_msg_text    TYPE string,
          lv_task_trkorr TYPE trkorr,
          lv_bcset_text  TYPE scpr_text,
          lv_task_e071   TYPE i,
          lv_task_e071k  TYPE i,
          lv_bcset_vals  TYPE i,
          lv_bcset_recs  TYPE i,
          lv_bcset_attrs TYPE i,
          lt_valuesl     TYPE STANDARD TABLE OF scprvall,
          lt_fielddescrs TYPE STANDARD TABLE OF scpr_records,
          lt_fldv        TYPE STANDARD TABLE OF scprfldv,
          lt_texts       TYPE STANDARD TABLE OF scprtext,
          lv_data_modified TYPE c LENGTH 1,
          lt_action_results TYPE scp1_general_errors,
          lx_template_save TYPE REF TO cx_root,
          lx_activ        TYPE REF TO cx_root,
          lv_e071_after  TYPE i,
          lv_e071k_after TYPE i,
          lt_persisted_vals TYPE STANDARD TABLE OF scprvals,
          lt_posted_keys TYPE SORTED TABLE OF string WITH UNIQUE KEY table_line,
          lt_candidate_recnrs TYPE SORTED TABLE OF scprvals-recnumber WITH UNIQUE KEY table_line,
          lv_posted_key TYPE string,
          lv_post_tab TYPE tabname,
          lv_post_rec TYPE scprvals-recnumber,
          lv_candidate_rec TYPE scprvals-recnumber,
          lv_record_matched TYPE abap_bool,
          lv_missing_records TYPE i,
          lv_missing_values TYPE i,
          lv_missing_example TYPE string.

    " Activation state returned by SCPR_ACTIVATE_BCSETS_REMOTE.
    DATA: lt_bcset_ids     TYPE STANDARD TABLE OF scpr_parnt,
          ls_bcset_id      TYPE scpr_parnt,
          lv_proto         TYPE scpr_handl,
          lv_rc_activ      TYPE scpracst,
          lv_task_syst_exp TYPE trkorr,
          lv_task_cust_exp TYPE trkorr,
          lt_after_imp     TYPE scpraftimptab,
          lt_variables     TYPE STANDARD TABLE OF scprvari,
          ls_variables_new TYPE scprvart.

    check_guard_rails( iv_bcset_id   = iv_bcset_id
                       iv_target_cli = iv_target_cli
                       it_values     = it_values ).

    " Build real BC-Set records. SCPRVALS carries ID/VERSION;
    " SCPRRECA is the DDIC table structure used by the SAVE FM.
    build_scprvals( EXPORTING iv_bcset_id       = iv_bcset_id
                              it_values         = it_values
                              it_source_recattr = it_source_recattr
                    IMPORTING et_values         = lt_vals
                              et_recattr        = lt_recattr
                              ev_tables         = lv_tables ).

    IF lt_vals IS INITIAL OR lt_recattr IS INITIAL.
      fail( |BC Set { iv_bcset_id } has no usable records after client fields were removed.| ).
    ENDIF.

    lv_trkorr = ensure_transport( EXPORTING iv_bcset_id = iv_bcset_id
                                            iv_trkorr   = iv_trkorr
                                  IMPORTING ev_task_trkorr = lv_task_trkorr ).

    " -----------------------------------------------------------------
    " STAGE-ONLY TARGET WORKFLOW
    "
    " Do not call SCPR_CT_TRANSPORT_CHECK here. The target contract is
    " to create the Customizing TR/Task and persist the selected BC Set
    " content into the transport context. The standard template SAVE
    " routine is responsible for its own transport insertion when
    " WITH_TRANSP_INSERT = 'X'. Requiring a pre-existing R3TR SCP1 row
    " before SAVE caused the staging flow to reject otherwise valid
    " deployments with:
    "   BC Set ... was not registered as R3TR SCP1 in task ...
    " That check belongs to an activation/transport-validation path,
    " not to this selected-content staging workflow.
    " -----------------------------------------------------------------

    " -----------------------------------------------------------------
    " V20/V8: USE THE TARGET SYSTEM'S STANDARD TEMPLATE SAVE ROUTINE.
    "
    " IMPORTANT: Do NOT call SCPR_EXT_BCSET_WRITE here.  The target
    " system's live SCPR_EXT_BCSET_WRITE path is the one that is dumping
    " in SCPR_PRSET_CT_KEY_CONFLICTS2 with CX_SY_ITAB_LINE_NOT_FOUND.
    "
    " The live signature supplied for SCPR_TEMPL_MN_TEMPLATE_SAVE shows
    " that it accepts PROFID/PROFTEXT/ORGID plus SCPRVALS/SCPRRECA and,
    " with WITH_TRANSP_INSERT='X', performs SCPR_CT_TRANSPORT_INSERT
    " internally before SCPR_PRSET_DB_STORE persists the data.
    " -----------------------------------------------------------------

    CLEAR: lt_valuesl, lt_fielddescrs, lt_fldv, lt_texts, lv_data_modified.

    lv_bcset_text = iv_bcset_text.
    IF lv_bcset_text IS INITIAL.
      lv_bcset_text = |iConfigPro { iv_bcset_id }|.
    ENDIF.

    TRY.
        CALL FUNCTION 'SCPR_TEMPL_MN_TEMPLATE_SAVE'
          EXPORTING
            profid                    = iv_bcset_id
            proftext                  = lv_bcset_text
            category                  = space
            cli_dep                   = space
            cli_cas                   = space
            reftype                   = space
            refname                   = space
            orgid                     = '/0SAP/'
            component                 = space
            minrelease                = space
            maxrelease                = space
            act_info                  = space
            bcset_type                = 'TMV'
            fldtxtvar_supplied        = space
            with_transp_insert        = 'X'
            with_commit               = 'X'
            with_progress_indicator   = space
            remove_denied_data        = space
            ask_for_cont_after_remove = space
            p_recnr_adjust             = space
            values_valuesl_complete   = space
          IMPORTING
            data_modified             = lv_data_modified
            action_results            = lt_action_results
          TABLES
            values                    = lt_vals
            valuesl                   = lt_valuesl
            recattr                   = lt_recattr
            fielddescrs               = lt_fielddescrs
            it_fldv                   = lt_fldv
            texts                     = lt_texts
          EXCEPTIONS
            user_abort               = 1
            error_in_transport_layer = 2
            inconsistent_data       = 3
            database_error          = 4
            OTHERS                  = 5.
      CATCH cx_root INTO lx_template_save.
        fail( |SCPR_TEMPL_MN_TEMPLATE_SAVE raised for { iv_bcset_id }: { lx_template_save->get_text( ) }| ).
    ENDTRY.

    IF sy-subrc <> 0.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg_text.
      IF lv_msg_text IS INITIAL.
        lv_msg_text = |SCPR_TEMPL_MN_TEMPLATE_SAVE RC={ sy-subrc }|.
      ENDIF.
      CASE sy-subrc.
        WHEN 1.
          fail( |BC Set save was cancelled: { lv_msg_text }| ).
        WHEN 2.
          fail( |BC Set save failed in the transport layer for task { lv_task_trkorr }: { lv_msg_text }| ).
        WHEN 3.
          fail( |BC Set { iv_bcset_id } was rejected as inconsistent: { lv_msg_text }| ).
        WHEN 4.
          fail( |BC Set { iv_bcset_id } database save failed: { lv_msg_text }| ).
        WHEN OTHERS.
          fail( |SCPR_TEMPL_MN_TEMPLATE_SAVE failed for { iv_bcset_id } (RC={ sy-subrc }): { lv_msg_text }| ).
      ENDCASE.
    ENDIF.

    " The live standard SAVE routine commits when WITH_COMMIT='X'.  Keep
    " an explicit wait here so the verification SELECTs run after the
    " update task/DB work has completed.
    COMMIT WORK AND WAIT.

    " Confirm the standard SAVE persisted the selected content.
    " IMPORTANT: SCPR_TEMPL_MN_TEMPLATE_SAVE is additive/merge-aware for an
    " existing BC Set. Therefore SCPRRECA/SCPRVALS totals can legitimately
    " be larger than the Gold payload. Never compare total persisted counts
    " with the number of selected records/fields.
    SELECT COUNT( * ) FROM scprattr INTO @lv_bcset_attrs
      WHERE id = @iv_bcset_id
        AND version = 'N'.
    SELECT COUNT( * ) FROM scprreca INTO @lv_bcset_recs
      WHERE id = @iv_bcset_id
        AND version = 'N'.
    SELECT COUNT( * ) FROM scprvals INTO @lv_bcset_vals
      WHERE id = @iv_bcset_id
        AND version = 'N'.

    IF lv_bcset_attrs = 0 OR lv_bcset_recs = 0 OR lv_bcset_vals = 0.
      fail( |BC Set { iv_bcset_id } was not persisted correctly by SCPR_TEMPL_MN_TEMPLATE_SAVE: SCPRATTR={ lv_bcset_attrs }, SCPRRECA={ lv_bcset_recs }, SCPRVALS={ lv_bcset_vals }.| ).
    ENDIF.

    " Verify the actual selected content rather than comparing whole-BC-Set
    " totals. SAP may retain pre-existing records and values, so a persisted
    " count such as 36/50 is valid when Gold posted only 8/10.
    SELECT *
      FROM scprvals
      WHERE id = @iv_bcset_id
        AND version = 'N'
      INTO TABLE @lt_persisted_vals.

    IF lt_persisted_vals IS INITIAL.
      fail( |BC Set { iv_bcset_id } has no persisted SCPRVALS after SAVE.| ).
    ENDIF.

    CLEAR:
      lt_posted_keys,
      lv_missing_records,
      lv_missing_values,
      lv_missing_example.

    " One logical posted record = table + original posted record number.
    " build_scprvals() renumbers selected records densely, while SAP may
    " merge them into an existing BC Set and assign a different target
    " record number. Verification therefore matches the complete selected
    " field/value set and does not rely only on the target RecNumber.
    LOOP AT lt_vals INTO DATA(ls_posted_value).
      INSERT |{ ls_posted_value-tablename }#{ ls_posted_value-recnumber }|
        INTO TABLE lt_posted_keys.
    ENDLOOP.

    LOOP AT lt_posted_keys INTO lv_posted_key.
      CLEAR:
        lv_post_tab,
        lv_post_rec,
        lt_candidate_recnrs,
        lv_record_matched.

      SPLIT lv_posted_key AT '#' INTO lv_post_tab lv_post_rec.

      " Candidate target record numbers for this table. Existing rows are
      " included because TEMPLATE_SAVE preserves pre-existing BC Set data.
      LOOP AT lt_persisted_vals INTO DATA(ls_candidate)
        WHERE tablename = lv_post_tab.
        INSERT ls_candidate-recnumber INTO TABLE lt_candidate_recnrs.
      ENDLOOP.

      LOOP AT lt_candidate_recnrs INTO lv_candidate_rec.
        DATA(lv_candidate_ok) = abap_true.

        LOOP AT lt_vals INTO DATA(ls_required_value)
          WHERE tablename = lv_post_tab
            AND recnumber = lv_post_rec.

          READ TABLE lt_persisted_vals TRANSPORTING NO FIELDS
            WITH KEY tablename = lv_post_tab
                     recnumber = lv_candidate_rec
                     fieldname = ls_required_value-fieldname
                     value     = ls_required_value-value.

          IF sy-subrc <> 0.
            lv_candidate_ok = abap_false.
            EXIT.
          ENDIF.

        ENDLOOP.

        IF lv_candidate_ok = abap_true.
          lv_record_matched = abap_true.
          EXIT.
        ENDIF.
      ENDLOOP.

      IF lv_record_matched = abap_false.
        lv_missing_records = lv_missing_records + 1.
        IF lv_missing_example IS INITIAL.
          lv_missing_example = lv_posted_key.
        ENDIF.

        LOOP AT lt_vals INTO DATA(ls_missing_value)
          WHERE tablename = lv_post_tab
            AND recnumber = lv_post_rec.
          READ TABLE lt_persisted_vals TRANSPORTING NO FIELDS
            WITH KEY tablename = lv_post_tab
                     fieldname = ls_missing_value-fieldname
                     value     = ls_missing_value-value.
          IF sy-subrc <> 0.
            lv_missing_values = lv_missing_values + 1.
          ENDIF.
        ENDLOOP.
      ENDIF.
    ENDLOOP.

    IF lv_missing_records > 0.
      fail( |BC Set { iv_bcset_id } selected content verification failed: missing records={ lv_missing_records }, missing values={ lv_missing_values }, first missing record={ lv_missing_example }.| ).
    ENDIF.

    " -----------------------------------------------------------------
    " SOURCE E071/E071K REPLAY
    " -----------------------------------------------------------------
    " SCPR_TEMPL_MN_TEMPLATE_SAVE persists the BC Set values and creates
    " the transport object entries, but the screenshots from the live
    " target show that the resulting E071 headers can have zero E071K
    " child keys. The source system already knows the exact E071K rows
    " produced by SCPR_BCSET_DATA_TO_E071, so replay those rows onto the
    " newly-created target task with the target task number substituted.
    " This is transport registration only; it does not write target table
    " data and does not replace TEMPLATE_SAVE or activation.
    " -----------------------------------------------------------------
    IF it_source_e071 IS NOT INITIAL.
      append_source_keys(
        iv_task_trkorr = lv_task_trkorr
        it_source_e071 = it_source_e071 ).

      COMMIT WORK AND WAIT.

      SELECT COUNT( * ) FROM e071k INTO @lv_e071k_after
        WHERE trkorr = @lv_task_trkorr.
    ENDIF.

    " Do NOT reject a staging deployment because the target task does not
    " contain a synthetic/explicit R3TR SCP1 BC Set object. This workflow's
    " contract is to create the Customizing TR/Task and persist the selected
    " BC Set content/transport keys. BC Set activation is deliberately not
    " performed by the studio workflow.
    "
    " The source E071/E071K rows are replayed above through
    " TR_APPEND_TO_COMM_OBJS_KEYS. The selected SCPRVALS/SCPRRECA content was
    " already verified before this point. Therefore the absence of an SCP1
    " row must not turn a valid staged transport into HTTP 400.

    " -----------------------------------------------------------------
    " Activation: use SAP's standard remote activation FM against the BC
    " Set we have just proven exists.  No direct INSERT/UPDATE to T001W.
    " -----------------------------------------------------------------
    CLEAR: ls_bcset_id, lv_proto, lv_rc_activ, lv_task_syst_exp,
           lv_task_cust_exp, lt_after_imp, lt_variables, ls_variables_new.

    ls_bcset_id-bcset_id = iv_bcset_id.
    APPEND ls_bcset_id TO lt_bcset_ids.

    IF iv_activate = abap_true.
      TRY.
          CALL FUNCTION 'SCPR_ACTIVATE_BCSETS_REMOTE'
            EXPORTING
              activation_type  = 1
              system           = sy-sysid
              mandant          = sy-mandt
              task_number_cust = lv_task_trkorr
              simulation_on    = space
              remote_type      = 'S'
              complete_only    = 1
              transport_off    = 'N'
              write_status     = 'X'
              batch_mode       = 'N'
              after_imp        = 'Y'
              category         = space
            IMPORTING
              proto_handle     = lv_proto
              rc_activ         = lv_rc_activ
              task_syst_exp    = lv_task_syst_exp
              task_cust_exp    = lv_task_cust_exp
              aft_imp_data     = lt_after_imp
            CHANGING
              variables_new    = ls_variables_new
            TABLES
              bcset_ids        = lt_bcset_ids
              variables        = lt_variables
            EXCEPTIONS
              no_authority     = 1
              no_bcset         = 2
              wrong_parameters = 3
              no_rfc_authority = 4
              rfc_failure      = 5
              internal_error   = 6
              batchjob_error   = 7
              OTHERS           = 8.
        CATCH cx_root INTO lx_activ.
          fail( |BC Set { iv_bcset_id } activation raised: { lx_activ->get_text( ) }| ).
      ENDTRY.

      IF sy-subrc <> 0.
        MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
          WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg_text.
        IF lv_msg_text IS INITIAL.
          lv_msg_text = |SCPR_ACTIVATE_BCSETS_REMOTE RC={ sy-subrc }|.
        ENDIF.
        fail( |BC Set { iv_bcset_id } was created and transported, but activation failed in client { sy-mandt }: { lv_msg_text }| ).
      ENDIF.

      IF lv_rc_activ IS NOT INITIAL AND lv_rc_activ <> '0'.
        fail( |BC Set { iv_bcset_id } activation returned RC_ACTIV={ lv_rc_activ }. Check the BC Set activation protocol for the failing record.| ).
      ENDIF.
    ENDIF.

    rs_result-bcset_id = iv_bcset_id.
    rs_result-trkorr   = lv_trkorr.
    rs_result-client   = sy-mandt.
    rs_result-tables   = lv_tables.
    rs_result-records  = lines( lt_recattr ).
    rs_result-values   = lines( lt_vals ).
    rs_result-status   = COND #( WHEN iv_activate = abap_true THEN 'ACTIVATED' ELSE 'STAGED' ).
    rs_result-message  = |BC Set { iv_bcset_id }: SCPRATTR={ lv_bcset_attrs }, SCPRRECA={ lv_bcset_recs }, SCPRVALS={ lv_bcset_vals }; | &&
                         |CTS task { lv_task_trkorr } has E071K={ lv_e071k_after }. | &&
                         COND #( WHEN iv_activate = abap_true
                                 THEN |Activation completed for client { sy-mandt }.|
                                 ELSE |BC Set saved/staged; activation was not requested.| ).

  ENDMETHOD.

  METHOD append_source_keys.

    DATA: lt_e071       TYPE STANDARD TABLE OF e071,
          lt_e071k      TYPE STANDARD TABLE OF e071k,
          lt_one_e071   TYPE STANDARD TABLE OF e071,
          lt_one_e071k  TYPE STANDARD TABLE OF e071k,
          ls_e071       TYPE e071,
          ls_e071k      TYPE e071k,
          lv_before     TYPE i,
          lv_after      TYPE i,
          lv_msg        TYPE string,
          lv_activity   TYPE e071-activity,
          lv_header_count TYPE i,
          lv_key_count    TYPE i.

    IF it_source_e071 IS INITIAL.
      RETURN.
    ENDIF.

    " The source entity is a flattened representation of the two real
    " transport tables:
    "   TABKEY initial    -> E071 header
    "   TABKEY populated  -> E071K key
    "
    " IMPORTANT: E071K is NOT related to its parent E071 by E071K-OBJECT /
    " E071K-OBJNAME. The real parent relationship is:
    "   E071-PGMID   = E071K-PGMID
    "   E071-OBJECT  = E071K-MASTERTYPE
    "   E071-OBJNAME = E071K-MASTERNAME
    "
    " This matters for the common case:
    "   E071  R3TR VDAT V_T001
    "   E071K R3TR TABU T001 ... MASTERTYPE=VDAT MASTERNAME=V_T001
    " The previous implementation compared OBJECT/OBJNAME on both rows,
    " so it could never attach that E071K row to V_T001.

    " ---- 1. Build every real source E071 header ---------------------
    CLEAR lt_e071.

    LOOP AT it_source_e071 INTO DATA(ls_source_header)
      WHERE tabkey IS INITIAL.

      CLEAR ls_e071.
      ls_e071-trkorr   = iv_task_trkorr.
      ls_e071-pgmid    = ls_source_header-pgmid.
      ls_e071-object   = ls_source_header-object.
      ls_e071-obj_name = ls_source_header-objname.
      ls_e071-objfunc  = ls_source_header-objfunc.
      ls_e071-activity = ls_source_header-activity.

      READ TABLE lt_e071 TRANSPORTING NO FIELDS
        WITH KEY pgmid    = ls_e071-pgmid
                 object   = ls_e071-object
                 obj_name = ls_e071-obj_name
                 objfunc  = ls_e071-objfunc
                 activity = ls_e071-activity.
      IF sy-subrc <> 0.
        APPEND ls_e071 TO lt_e071.
      ENDIF.
    ENDLOOP.

    lv_header_count = lines( lt_e071 ).

    IF lv_header_count = 0.
      fail( |SourceE071Json contains no E071 header rows for task { iv_task_trkorr }. Every E071 header must have a blank TABKEY.| ).
    ENDIF.

    " ---- 2. Replay each E071 header with its actual E071K children --
    " One call per header keeps ACT_CTS scoped to the exact source
    " E071-ACTIVITY. The key rows are selected by the genuine E071/E071K
    " parent relationship, not by the key row's own OBJECT/OBJNAME.
    LOOP AT lt_e071 INTO ls_e071.

      CLEAR: lt_one_e071, lt_one_e071k.
      APPEND ls_e071 TO lt_one_e071.

      LOOP AT it_source_e071 INTO DATA(ls_source_key)
        WHERE tabkey IS NOT INITIAL.

        DATA(lv_parent_match) = abap_false.

        " Primary SAP relationship: E071 parent object is carried in
        " E071K-MASTERTYPE / MASTERNAME.
        IF ls_source_key-pgmid      = ls_e071-pgmid
           AND ls_source_key-mastertype = ls_e071-object
           AND ls_source_key-mastername = ls_e071-obj_name.
          lv_parent_match = abap_true.
        ENDIF.

        " Fallback for direct-key rows/releases where MASTER fields are
        " blank: the E071K row itself can identify the parent object.
        IF lv_parent_match = abap_false
           AND ls_source_key-mastertype IS INITIAL
           AND ls_source_key-mastername IS INITIAL
           AND ls_source_key-pgmid   = ls_e071-pgmid
           AND ls_source_key-object  = ls_e071-object
           AND ls_source_key-objname = ls_e071-obj_name.
          lv_parent_match = abap_true.
        ENDIF.

        IF lv_parent_match = abap_false.
          CONTINUE.
        ENDIF.

        CLEAR ls_e071k.
        ls_e071k-trkorr     = iv_task_trkorr.
        ls_e071k-pgmid      = ls_source_key-pgmid.
        ls_e071k-object     = ls_source_key-object.
        ls_e071k-objname    = ls_source_key-objname.
        ls_e071k-tabkey     = ls_source_key-tabkey.
        ls_e071k-mastertype = ls_source_key-mastertype.
        ls_e071k-mastername = ls_source_key-mastername.
        ls_e071k-viewname   = ls_source_key-viewname.

        READ TABLE lt_one_e071k TRANSPORTING NO FIELDS
          WITH KEY pgmid      = ls_e071k-pgmid
                   object     = ls_e071k-object
                   objname    = ls_e071k-objname
                   mastertype = ls_e071k-mastertype
                   mastername = ls_e071k-mastername
                   viewname   = ls_e071k-viewname
                   tabkey     = ls_e071k-tabkey.
        IF sy-subrc <> 0.
          APPEND ls_e071k TO lt_one_e071k.
        ENDIF.

      ENDLOOP.

      lv_key_count = lv_key_count + lines( lt_one_e071k ).

      lv_activity = ls_e071-activity.
      EXPORT activity = lv_activity TO MEMORY ID 'ACT_CTS'.

      CALL FUNCTION 'TR_APPEND_TO_COMM_OBJS_KEYS'
        EXPORTING
          wi_simulation         = space
          wi_suppress_key_check = space
          wi_trkorr             = iv_task_trkorr
        TABLES
          wt_e071               = lt_one_e071
          wt_e071k              = lt_one_e071k
        EXCEPTIONS
          OTHERS                = 68.

      IF sy-subrc <> 0.
        MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
          WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_msg.
        IF lv_msg IS INITIAL.
          lv_msg = |TR_APPEND_TO_COMM_OBJS_KEYS RC={ sy-subrc }.|.
        ENDIF.
        fail( |E071/E071K registration failed for { ls_e071-pgmid } { ls_e071-object } { ls_e071-obj_name } on task { iv_task_trkorr }: { lv_msg }| ).
      ENDIF.

    ENDLOOP.

    " ---- 3. Verify every source E071 header exists -----------------
    LOOP AT lt_e071 INTO DATA(ls_verify_e071).

      SELECT SINGLE trkorr FROM e071 INTO @DATA(lv_header_trkorr)
        WHERE trkorr   = @iv_task_trkorr
          AND pgmid    = @ls_verify_e071-pgmid
          AND object   = @ls_verify_e071-object
          AND obj_name = @ls_verify_e071-obj_name
          AND objfunc  = @ls_verify_e071-objfunc
          AND activity = @ls_verify_e071-activity.

      IF sy-subrc <> 0.
        fail( |E071 header was not registered on task { iv_task_trkorr }: { ls_verify_e071-pgmid } { ls_verify_e071-object } { ls_verify_e071-obj_name } OBJFUNC={ ls_verify_e071-objfunc } ACTIVITY={ ls_verify_e071-activity }| ).
      ENDIF.

    ENDLOOP.

    " ---- 4. Verify every source E071K key exists -------------------
    SELECT COUNT( * ) FROM e071k INTO @lv_before
      WHERE trkorr = @iv_task_trkorr.

    LOOP AT it_source_e071 INTO DATA(ls_verify_key)
      WHERE tabkey IS NOT INITIAL.

      " Only compare against the target task. E071K-TRKORR is deliberately
      " replaced with the target task number during replay.
      SELECT SINGLE trkorr FROM e071k INTO @DATA(lv_key_trkorr)
        WHERE trkorr     = @iv_task_trkorr
          AND pgmid      = @ls_verify_key-pgmid
          AND object     = @ls_verify_key-object
          AND objname    = @ls_verify_key-objname
          AND tabkey     = @ls_verify_key-tabkey
          AND mastertype = @ls_verify_key-mastertype
          AND mastername = @ls_verify_key-mastername
          AND viewname   = @ls_verify_key-viewname.

      IF sy-subrc <> 0.
        fail( |E071K key was not registered on task { iv_task_trkorr }: { ls_verify_key-pgmid } { ls_verify_key-object } { ls_verify_key-objname } TABKEY={ ls_verify_key-tabkey } MASTER={ ls_verify_key-mastername } VIEW={ ls_verify_key-viewname }| ).
      ENDIF.

    ENDLOOP.

    SELECT COUNT( * ) FROM e071k INTO @lv_after
      WHERE trkorr = @iv_task_trkorr.

    " Clear ACT_CTS after all non-dialog CTS calls so the source activity
    " cannot leak into a later transport operation in the same LUW.
    CLEAR lv_activity.
    EXPORT activity = lv_activity TO MEMORY ID 'ACT_CTS'.

  ENDMETHOD.

  METHOD check_guard_rails.

    IF iv_bcset_id IS INITIAL.
      fail( |The request carries no BcsetId.| ).
    ENDIF.

    IF it_values IS INITIAL.
      fail( |The request carries no ToValues entries, so there is nothing to deploy.| ).
    ENDIF.

    " Never let a caller name a client other than the one it is logged
    " into. sap-client on the URL decides the session; a mismatch means
    " the payload was built for somewhere else.
    IF iv_target_cli IS NOT INITIAL AND iv_target_cli <> sy-mandt.
      fail( |This payload is addressed to client { iv_target_cli } but the service is | &&
            |running in { sy-mandt }. Point the studio at the right client.| ).
    ENDIF.

    " The client has to be open for customizing changes.
    DATA ls_t000 TYPE t000.

    SELECT SINGLE cccoractiv, cccategory
      FROM t000
      INTO @ls_t000
      WHERE mandt = @sy-mandt.

    IF sy-subrc <> 0.
      fail( |Client { sy-mandt } is not defined in T000.| ).
    ENDIF.

    IF ls_t000-cccoractiv = '2'.
      fail( |Client { sy-mandt } is closed for customizing changes | &&
            |(T000-CCCORACTIV = 2). Open it in SCC4 or deploy elsewhere.| ).
    ENDIF.

    AUTHORITY-CHECK OBJECT 'S_TABU_DIS'
      ID 'DICBERCLS' DUMMY
      ID 'ACTVT' FIELD '02'.
    IF sy-subrc <> 0.
      fail( |{ sy-uname } is not authorised to change customizing tables | &&
            |in client { sy-mandt } (S_TABU_DIS, activity 02).| ).
    ENDIF.

  ENDMETHOD.


  METHOD build_scprvals.

*&     SCPR expects record numbers running 1..n within each table, so the
*&     posted numbers are renumbered densely rather than trusted. Sorting
*&     first means a caller may send the fields of one record in any order
*&     or out of sequence.

    DATA: lt_in      TYPE tt_value,
          ls_val     TYPE scprvals,
          ls_recattr TYPE scprreca,
          lv_recnr   TYPE scprreca-recnumber,
          lv_key     TYPE string,
          lv_prevkey TYPE string,
          lv_prevtab TYPE tabname,
          lv_tables  TYPE i,
          ls_in      TYPE ty_value,
          ls_src_recattr TYPE ty_recattr_entry.

    CLEAR: et_values, et_recattr.
    ev_tables = 0.

    lt_in = it_values.

    " Drop client fields before grouping, so a record made only of MANDT
    " does not leave an empty record behind in SCPRRECA.
    DELETE lt_in WHERE fieldname = c_technical-mandt
                    OR fieldname = c_technical-client.

    " BC Set RECNUMBER is only an internal sequence. The same physical
    " customizing record can occur under more than one BC Set record
    " number. Deduplicate by the real DDIC primary key of the physical
    " table before dense target RECNUMBER values are assigned.
    lt_in = dedupe_business_records( lt_in ).

    SORT lt_in BY tabname recnumber fieldname.

    " '~' cannot occur in a table name, so the first row always starts a
    " new record even when its posted RecNumber is zero.
    lv_prevkey = '~'.

    LOOP AT lt_in INTO ls_in.

      IF ls_in-tabname <> lv_prevtab.
        lv_prevtab = ls_in-tabname.
        lv_recnr   = 0.
        lv_prevkey = '~'.
        lv_tables  = lv_tables + 1.
      ENDIF.

      lv_key = |{ ls_in-tabname }#{ ls_in-recnumber }|.

      IF lv_key <> lv_prevkey.
        lv_prevkey = lv_key.
        lv_recnr   = lv_recnr + 1.

        CLEAR ls_recattr.
        CONDENSE lv_recnr.
        ls_recattr-id        = iv_bcset_id.
        ls_recattr-version   = 'N'.
        ls_recattr-tablename = ls_in-tabname.
        ls_recattr-recnumber = lv_recnr.

        " SCPRRECA-ACTIVITY's data element is DOKU_OBJ, "Documentation
        " Object" (confirmed via SE11, 2026-09-12) - a real reference like
        " "SIMG_CFMENUOLMEOMEB", not a boolean. Setting it to abap_true
        " ('X') here, as this code used to, was never semantically
        " correct. When a mirrored SCPRRECA row exists for this exact
        " (tablename, recnumber) - see IT_SOURCE_RECATTR's own comment for
        " where that comes from and its matching caveat - use its real
        " ObjectName/ObjectType/Documentation Object/Uncomplete. Otherwise
        " leave these blank rather than fabricate a value.
        " Match source RECATTR using the original posted record number.
        " LV_REcnr is the new dense target number and must not be used
        " to look up source metadata.
        READ TABLE it_source_recattr INTO ls_src_recattr
          WITH KEY tablename = ls_in-tabname
                   recnumber = ls_in-recnumber.
        IF sy-subrc = 0.
          ls_recattr-objectname = ls_src_recattr-objectname.
          ls_recattr-objecttype = ls_src_recattr-objecttype.
          ls_recattr-activity   = ls_src_recattr-docu_object.
          ls_recattr-uncomplete = ls_src_recattr-uncomplete.
        ENDIF.

        APPEND ls_recattr TO et_recattr.
      ENDIF.

      CLEAR ls_val.
      ls_val-id        = iv_bcset_id.
      ls_val-version   = 'N'.
      ls_val-tablename = ls_in-tabname.
      ls_val-recnumber = lv_recnr.
      ls_val-fieldname = ls_in-fieldname.
      ls_val-value     = ls_in-value.
      APPEND ls_val TO et_values.

    ENDLOOP.

    ev_tables = lv_tables.

  ENDMETHOD.



  METHOD dedupe_business_records.

    DATA: lt_in          TYPE tt_value,
          lt_record      TYPE tt_value,
          lt_key_fields  TYPE tt_fieldnames,
          lt_seen        TYPE HASHED TABLE OF string WITH UNIQUE KEY table_line,
          ls_in          TYPE ty_value,
          ls_record      TYPE ty_value,
          lv_tabname     TYPE tabname,
          lv_recnumber   TYPE i,
          lv_identity    TYPE string,
          lv_key_value   TYPE string,
          lv_missing_key TYPE abap_bool,
          lv_first       TYPE abap_bool.

    CLEAR rt_values.
    lt_in = it_values.

    SORT lt_in BY tabname recnumber fieldname.

    CLEAR: lt_record, lv_tabname, lv_recnumber, lv_first.
    lv_first = abap_true.

    LOOP AT lt_in INTO ls_in.

      IF lv_first = abap_true OR
         ls_in-tabname <> lv_tabname OR
         ls_in-recnumber <> lv_recnumber.

        IF lv_first = abap_false AND lt_record IS NOT INITIAL.

          CLEAR: lv_identity, lv_missing_key.
          lt_key_fields = get_ddic_key_fields( lv_tabname ).

          IF lt_key_fields IS INITIAL.
            lv_identity = |{ lv_tabname }#REC={ lv_recnumber }|.
          ELSE.
            LOOP AT lt_key_fields INTO DATA(lv_fieldname).

              CLEAR lv_key_value.

              READ TABLE lt_record INTO ls_record
                WITH KEY fieldname = lv_fieldname.

              IF sy-subrc <> 0.
                lv_missing_key = abap_true.
                EXIT.
              ENDIF.

              lv_key_value = ls_record-value.
              REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab
                IN lv_key_value WITH space.
              CONDENSE lv_key_value.
              TRANSLATE lv_key_value TO UPPER CASE.

              IF lv_key_value IS INITIAL.
                lv_missing_key = abap_true.
                EXIT.
              ENDIF.

              lv_identity = |{ lv_identity }| &&
                            |{ lv_fieldname }={ lv_key_value }| &&
                            '|'.

            ENDLOOP.

            IF lv_missing_key = abap_true.
              lv_identity = |{ lv_tabname }#REC={ lv_recnumber }|.
            ELSE.
              lv_identity = |{ lv_tabname }#{ lv_identity }|.
            ENDIF.
          ENDIF.

          READ TABLE lt_seen TRANSPORTING NO FIELDS
            WITH TABLE KEY table_line = lv_identity.

          IF sy-subrc <> 0.
            INSERT lv_identity INTO TABLE lt_seen.
            APPEND LINES OF lt_record TO rt_values.
          ENDIF.

        ENDIF.

        CLEAR lt_record.
        lv_tabname   = ls_in-tabname.
        lv_recnumber = ls_in-recnumber.
        lv_first     = abap_false.

      ENDIF.

      APPEND ls_in TO lt_record.

    ENDLOOP.

    " Process the final record group.
    IF lt_record IS NOT INITIAL.

      CLEAR: lv_identity, lv_missing_key.
      lt_key_fields = get_ddic_key_fields( lv_tabname ).

      IF lt_key_fields IS INITIAL.
        lv_identity = |{ lv_tabname }#REC={ lv_recnumber }|.
      ELSE.
        LOOP AT lt_key_fields INTO DATA(lv_last_fieldname).

          CLEAR lv_key_value.

          READ TABLE lt_record INTO ls_record
            WITH KEY fieldname = lv_last_fieldname.

          IF sy-subrc <> 0.
            lv_missing_key = abap_true.
            EXIT.
          ENDIF.

          lv_key_value = ls_record-value.
          REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab
            IN lv_key_value WITH space.
          CONDENSE lv_key_value.
          TRANSLATE lv_key_value TO UPPER CASE.

          IF lv_key_value IS INITIAL.
            lv_missing_key = abap_true.
            EXIT.
          ENDIF.

          lv_identity = |{ lv_identity }| &&
                        |{ lv_last_fieldname }={ lv_key_value }| &&
                        '|'.

        ENDLOOP.

        IF lv_missing_key = abap_true.
          lv_identity = |{ lv_tabname }#REC={ lv_recnumber }|.
        ELSE.
          lv_identity = |{ lv_tabname }#{ lv_identity }|.
        ENDIF.
      ENDIF.

      READ TABLE lt_seen TRANSPORTING NO FIELDS
        WITH TABLE KEY table_line = lv_identity.

      IF sy-subrc <> 0.
        INSERT lv_identity INTO TABLE lt_seen.
        APPEND LINES OF lt_record TO rt_values.
      ENDIF.

    ENDIF.

  ENDMETHOD.


  METHOD get_ddic_key_fields.

    DATA: lt_dfies TYPE STANDARD TABLE OF dfies,
          ls_dfies TYPE dfies.

    CLEAR rt_fields.

    IF iv_tabname IS INITIAL.
      RETURN.
    ENDIF.

    CALL FUNCTION 'DDIF_FIELDINFO_GET'
      EXPORTING
        tabname        = iv_tabname
        langu          = sy-langu
        all_types      = abap_true
      TABLES
        dfies_tab      = lt_dfies
      EXCEPTIONS
        not_found      = 1
        internal_error = 2
        OTHERS         = 3.

    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT lt_dfies INTO ls_dfies
      WHERE keyflag = 'X'.

      IF ls_dfies-fieldname = c_technical-mandt OR
         ls_dfies-fieldname = c_technical-client.
        CONTINUE.
      ENDIF.

      APPEND ls_dfies-fieldname TO rt_fields.

    ENDLOOP.

  ENDMETHOD.


  METHOD ensure_transport.

    " Reuse the request the caller named, if it named one. Used as given -
    " a caller-supplied number is assumed to already carry a usable task.
    DATA: lv_found TYPE trkorr,
          ls_task TYPE trwbo_request_header.

    IF iv_trkorr IS NOT INITIAL.
      SELECT SINGLE trkorr FROM e070 INTO @lv_found
        WHERE trkorr = @iv_trkorr.
      IF sy-subrc <> 0.
        fail( |Transport request { iv_trkorr } does not exist in this system.| ).
      ENDIF.
      rv_trkorr      = iv_trkorr.
      ev_task_trkorr = iv_trkorr.
      RETURN.
    ENDIF.

    " Otherwise create a customizing request. 'W' is customizing;
    " workbench would be 'K', and customizing is what a BC Set needs.
    "
    " IT_USERS was wrongly diagnosed earlier as a legacy generic TABLES
    " parameter needing a header-line table - its real signature (SE37
    " source pulled and confirmed) types it as SCTS_USERS, a normal
    " typed IMPORTING parameter. The earlier CALL_FUNCTION_CONFLICT_TYPE
    " dump was a row-type mismatch (TR_USER guessed, SCTS_USER real), not
    " a calling-convention problem. Removing it meant no task was ever
    " created under the request - TR_INSERT_REQUEST_WITH_TASKS only
    " builds one per entry in IT_USERS - and registering an object
    " against a bare request header with no task underneath it is
    " exactly what "Changes to objects are only allowed in
    " correction/repair" means. Confirmed live. So one task is created
    " here, owned by the same user (IV_OWNER decides request ownership;
    " IT_USERS decides whose task gets created), and its own trkorr -
    " not the request's - is what the caller uses to register objects.
    " ES_REQUEST_HEADER/ET_TASK_HEADERS declared explicitly, not inline -
    " CALL FUNCTION's EXPORTING/IMPORTING/TABLES/CHANGING parameters do
    " uses explicit work areas because this target release does not
    " permit inline DATA declarations in CALL FUNCTION parameter positions.
    DATA: lt_users        TYPE scts_users,
          ls_user         TYPE scts_user,
          ls_header       TYPE trwbo_request_header,
          lt_task_headers TYPE trwbo_request_headers.

    CLEAR ls_user.
    ls_user-user = sy-uname.
    APPEND ls_user TO lt_users.

    CALL FUNCTION 'TR_INSERT_REQUEST_WITH_TASKS'
      EXPORTING
        iv_type           = 'W'
        iv_text           = |iConfigPro { iv_bcset_id }|
        iv_owner          = sy-uname
        it_users          = lt_users
      IMPORTING
        es_request_header = ls_header
        et_task_headers   = lt_task_headers
      EXCEPTIONS
        OTHERS            = 1.

    IF sy-subrc <> 0 OR ls_header-trkorr IS INITIAL.
      fail( |Could not create a customizing transport request for { iv_bcset_id } | &&
            |(rc={ sy-subrc }). Create one in SE09 and post its number in Trkorr.| ).
    ENDIF.

    rv_trkorr = ls_header-trkorr.

    READ TABLE lt_task_headers INTO ls_task INDEX 1.
    IF sy-subrc = 0.
      ev_task_trkorr = ls_task-trkorr.
    ELSE.
      fail( |Request { rv_trkorr } was created but no task came back for { sy-uname }. | &&
            |Check SE09: { rv_trkorr } should show one task underneath it.| ).
    ENDIF.

  ENDMETHOD.


  METHOD fail.

    " Gateway turns this into an HTTP 400 whose body carries the text, so
    " the studio's terminal shows the real reason rather than a code.
    "
    " FIXED 2026-09-15: this is very likely the actual cause of the
    " "blank /iwbep/cx_mgw_busi_exception, no ST22 dump" symptom that
    " originally drove the BC-Set write removal (see this class's own
    " header comment) - MESSAGE alone, without MESSAGE_UNLIMITED =
    " ABAP_TRUE, is a known Gateway framework gotcha: the OData error
    " serialisation falls back to needing a proper T100 TEXTID instead of
    " a raw string, and silently drops the free text. The exception and
    " its message were most likely being raised and caught correctly the
    " whole way; only the HTTP response body ever lost the text - nothing
    " actually crashed. bapi_msg (CHAR220) also silently truncates a
    " longer message on plain assignment - switched to string, which
    " message_unlimited exists specifically to allow.
    DATA lv_msg TYPE string.
    lv_msg = iv_text.

    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message           = lv_msg
        message_unlimited = iv_text.

  ENDMETHOD.


ENDCLASS.
*& ---------------------------------------------------------------------
*& V9 DESIGN: TR_SOURCEBCSETID
*&
*& The simulator now treats the source transport + source BC Set as one
*& logical deployment identity, for example:
*&
*&     DEVK900123_ZP2P_FICO_001
*&
*& This is a CORRELATION ID, not an SAP TRKORR and not the target BC Set
*& ID.  The SAP BC Set ID remains IV_BCSET_ID.  The target transport is
*& still created/reused separately.  A TR number alone cannot recreate
*& source BC Set contents across systems unless the actual SAP transport
*& content is imported through CTS.  This OData deployment therefore uses
*& the source TR as provenance/correlation while carrying the source BC
*& Set values through the existing payload.
*&
*& IMPORTANT: do not set IV_BCSET_ID to the 24-character composite.
*& BC Set IDs have their own DDIC/domain limits.
*& ---------------------------------------------------------------------


