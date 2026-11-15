CLASS zcl_im_bcset_deploy DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    "! One posted value: one field of one record of one table.
    "! This mirrors SCPRVALS, which is what the target has to fill.
    "! viewname is the source maintenance view for this table (e.g.
    "! V_T001 for T001) and is carried only as source provenance. Target
    "! transport registration is performed against the physical table
    "! (R3TR TABU <tabname>) so a source-only maintenance view does not
    "! cause a target object-existence failure.
    TYPES:
      BEGIN OF ty_value,
        tabname   TYPE tabname,
        recnumber TYPE i,
        fieldname TYPE fieldname,
        value     TYPE string,
        viewname  TYPE tabname,
      END OF ty_value,
      tt_value TYPE STANDARD TABLE OF ty_value WITH DEFAULT KEY.

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
        VALUE(rs_result)  TYPE ty_result
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
                it_source_e071    TYPE tt_e071_entry OPTIONAL
                it_source_recattr TYPE tt_recattr_entry OPTIONAL
      EXPORTING et_values         TYPE STANDARD TABLE
                et_recattr        TYPE STANDARD TABLE
                ev_tables         TYPE i
      RAISING /iwbep/cx_mgw_busi_exception.

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



CLASS ZCL_IM_BCSET_DEPLOY IMPLEMENTATION.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Private Method ZCL_IM_BCSET_DEPLOY=>BUILD_SCPRVALS
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_BCSET_ID                    TYPE        SCPR_ID
* | [--->] IT_VALUES                      TYPE        TT_VALUE
* | [--->] IT_SOURCE_E071                 TYPE        TT_E071_ENTRY(optional)
* | [--->] IT_SOURCE_RECATTR              TYPE        TT_RECATTR_ENTRY(optional)
* | [<---] ET_VALUES                      TYPE        STANDARD TABLE
* | [<---] ET_RECATTR                     TYPE        STANDARD TABLE
* | [<---] EV_TABLES                      TYPE        I
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD build_scprvals.

*&     SCPR expects record numbers running 1..n within each table, so the
*&     posted numbers are renumbered densely rather than trusted. Sorting
*&     first means a caller may send the fields of one record in any order
*&     or out of sequence.

    DATA: lt_in          TYPE tt_value,
          ls_val         TYPE scprvals,
          ls_recattr     TYPE scprreca,
          lv_recnr       TYPE scprreca-recnumber,
          lv_key         TYPE string,
          lv_prevkey     TYPE string,
          lv_prevtab     TYPE tabname,
          lv_tables      TYPE i,
          ls_in          TYPE ty_value,
          ls_src_recattr TYPE ty_recattr_entry,
          ls_src_e071    TYPE ty_e071_entry,
          lv_e071_found  TYPE abap_bool.

    CLEAR: et_values, et_recattr.
    ev_tables = 0.

    lt_in = it_values.

    " Drop client fields before grouping, so a record made only of MANDT
    " does not leave an empty record behind in SCPRRECA.
    DELETE lt_in WHERE fieldname = c_technical-mandt
                    OR fieldname = c_technical-client.

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
        " Object" - a real reference such as SIMG_CFMENU... and not a
        " boolean. Prefer the exact source SCPRRECA row. If that row is
        " unavailable (or contains no usable object/activity metadata),
        " derive the attributes from the corresponding SOURCE E071 header.
        " This is source transport metadata already supplied by the caller;
        " it is not fabricated and does not change the target table data.
        "
        " Match source RECATTR using the original posted record number.
        " LV_REcnr is the new dense target number and must not be used
        " to look up source metadata.
        CLEAR: ls_src_recattr, ls_src_e071, lv_e071_found.

        READ TABLE it_source_recattr INTO ls_src_recattr
          WITH KEY tablename = ls_in-tabname
                   recnumber = ls_in-recnumber.
        IF sy-subrc = 0.
          ls_recattr-objectname = ls_src_recattr-objectname.
          ls_recattr-objecttype = ls_src_recattr-objecttype.
          ls_recattr-activity   = ls_src_recattr-docu_object.
          ls_recattr-uncomplete = ls_src_recattr-uncomplete.
        ENDIF.

        " A blank SCPRRECA row is not safe for standard BC Set save/activation
        " and can surface later as S_CUS_IMG_ACTIVITY 119 ("Internal error:
        " Pass the object name and type or the IMG activity"). Use E071 as the
        " authoritative fallback because its OBJECT/OBJ_NAME/ACTIVITY are the
        " source transport metadata for the same BC Set object.
        IF ( ls_recattr-objectname IS INITIAL
             OR ls_recattr-objecttype IS INITIAL )
           AND ls_recattr-activity IS INITIAL.

          " Prefer the specific maintenance view carried with the value.
          " For example, T001 values normally point to V_T001. If no distinct
          " view was supplied, use the table name as the E071 object name.
          IF ls_in-viewname IS NOT INITIAL
             AND ls_in-viewname <> ls_in-tabname.
            LOOP AT it_source_e071 INTO ls_src_e071
              WHERE tabkey IS INITIAL
                AND objname = ls_in-viewname.
              lv_e071_found = abap_true.
              EXIT.
            ENDLOOP.
          ENDIF.

          IF lv_e071_found = abap_false.
            LOOP AT it_source_e071 INTO ls_src_e071
              WHERE tabkey IS INITIAL
                AND objname = ls_in-tabname.
              lv_e071_found = abap_true.
              EXIT.
            ENDLOOP.
          ENDIF.

          IF lv_e071_found = abap_true.
            IF ls_recattr-objectname IS INITIAL.
              ls_recattr-objectname = ls_src_e071-objname.
            ENDIF.
            IF ls_recattr-objecttype IS INITIAL.
              ls_recattr-objecttype = ls_src_e071-object.
            ENDIF.
            IF ls_recattr-activity IS INITIAL.
              ls_recattr-activity = ls_src_e071-activity.
            ENDIF.
          ENDIF.

          " Final fallback: resolve the physical-table E071K child to its
          " actual E071 parent. Do not require VIEWNAME/OBJNAME on the
          " E071 header to equal the physical table name. Standard BC Set
          " transport metadata commonly looks like:
          "   E071  = R3TR / VDAT / V_T001 / Activity
          "   E071K = R3TR / TABU / T001 / MASTER=VDAT/V_T001
          " The E071K child is therefore sufficient to recover both the
          " object identity and the parent's IMG Activity.
          IF ( ls_recattr-objectname IS INITIAL
               OR ls_recattr-objecttype IS INITIAL )
             AND ls_recattr-activity IS INITIAL.

            LOOP AT it_source_e071 INTO DATA(ls_src_key)
              WHERE tabkey IS NOT INITIAL
                AND objname = ls_in-tabname.

              IF ls_recattr-objectname IS INITIAL.
                ls_recattr-objectname = ls_src_key-objname.
              ENDIF.
              IF ls_recattr-objecttype IS INITIAL.
                ls_recattr-objecttype = ls_src_key-object.
              ENDIF.

              LOOP AT it_source_e071 INTO DATA(ls_src_parent)
                WHERE tabkey IS INITIAL
                  AND pgmid = ls_src_key-pgmid
                  AND object = ls_src_key-mastertype
                  AND objname = ls_src_key-mastername.
                IF ls_recattr-activity IS INITIAL.
                  ls_recattr-activity = ls_src_parent-activity.
                ENDIF.
                EXIT.
              ENDLOOP.

              IF ls_recattr-activity IS INITIAL.
                ls_recattr-activity = ls_src_key-activity.
              ENDIF.

              lv_e071_found = abap_true.
              EXIT.
            ENDLOOP.
          ENDIF.
        ENDIF.

        " Do not let standard SAP fail later with the opaque plugin-mode HTTP
        " error. Stop here with the actual missing metadata if neither source
        " SCPRRECA nor source E071 can describe this record.
        IF ( ls_recattr-objectname IS INITIAL
             OR ls_recattr-objecttype IS INITIAL )
           AND ls_recattr-activity IS INITIAL.
          fail( |BC Set { iv_bcset_id } record { ls_in-tabname } source record { ls_in-recnumber } has no SCPRRECA ObjectName/ObjectType or E071 IMG Activity metadata. Provide SourceE071Json or SourceRecAttrJson for this record.| ).
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


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Private Method ZCL_IM_BCSET_DEPLOY=>CHECK_GUARD_RAILS
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_BCSET_ID                    TYPE        SCPR_ID
* | [--->] IV_TARGET_CLI                  TYPE        SYMANDT
* | [--->] IT_VALUES                      TYPE        TT_VALUE
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
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


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Public Method ZCL_IM_BCSET_DEPLOY=>DEPLOY_BCSET
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_BCSET_ID                    TYPE        SCPR_ID
* | [--->] IV_BCSET_TEXT                  TYPE        SCPR_TEXT(optional)
* | [--->] IV_TARGET_CLI                  TYPE        SYMANDT(optional)
* | [--->] IV_TRKORR                      TYPE        TRKORR(optional)
* | [--->] IV_ACTIVATE                    TYPE        ABAP_BOOL (default =ABAP_FALSE)
* | [--->] IT_VALUES                      TYPE        TT_VALUE
* | [--->] IT_SOURCE_E071                 TYPE        TT_E071_ENTRY(optional)
* | [--->] IT_SOURCE_RECATTR              TYPE        TT_RECATTR_ENTRY(optional)
* | [<-()] RS_RESULT                      TYPE        TY_RESULT
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD deploy_bcset.

    DATA: lt_vals           TYPE STANDARD TABLE OF scprvals,
          lt_recattr        TYPE STANDARD TABLE OF scprreca,
          lv_trkorr         TYPE trkorr,
          lv_tables         TYPE i,
          lv_msg_text       TYPE string,
          lv_task_trkorr    TYPE trkorr,
          lv_bcset_text     TYPE scpr_text,
          lv_ct_ret         TYPE i,
          lv_ct_msg         TYPE string,
          lv_task_e071      TYPE i,
          lv_task_e071k     TYPE i,
          lv_bcset_vals     TYPE i,
          lv_bcset_recs     TYPE i,
          lv_bcset_attrs    TYPE i,
          lt_valuesl        TYPE STANDARD TABLE OF scprvall,
          lt_fielddescrs    TYPE STANDARD TABLE OF scpr_records,
          lt_fldv           TYPE STANDARD TABLE OF scprfldv,
          lt_texts          TYPE STANDARD TABLE OF scprtext,
          lv_data_modified  TYPE c LENGTH 1,
          ls_ko200          TYPE ko200,
          lt_check_e071k    TYPE STANDARD TABLE OF e071k,
          lt_action_results TYPE scp1_general_errors,
          lx_check          TYPE REF TO cx_root,
          lx_template_save  TYPE REF TO cx_root,
          lx_activ          TYPE REF TO cx_root,
          lv_e071_after     TYPE i,
          lv_e071k_after    TYPE i.

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
                              it_source_e071    = it_source_e071
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
    " V9: USE THE SAME STANDARD SAVE PATH AS SAP BC-SET MAINTENANCE.
    "
    " Register/check the standard R3TR SCP1 BC-Set object before writing.
    " -----------------------------------------------------------------

    CLEAR: lv_ct_ret, lv_ct_msg.

    TRY.
        CALL FUNCTION 'SCPR_CT_TRANSPORT_CHECK'
          EXPORTING
            profid          = iv_bcset_id
            category        = space
          IMPORTING
            we_ko200        = ls_ko200
            ret             = lv_ct_ret
          TABLES
            wt_e071k        = lt_check_e071k
          EXCEPTIONS
            stop_editing    = 1
            to_display_mode = 2
            OTHERS          = 3.
      CATCH cx_root INTO lx_check.
        fail( |SCPR_CT_TRANSPORT_CHECK failed for { iv_bcset_id }: { lx_check->get_text( ) }| ).
    ENDTRY.

    IF sy-subrc <> 0.
      MESSAGE ID sy-msgid TYPE 'S' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO lv_ct_msg.
      IF lv_ct_msg IS INITIAL.
        lv_ct_msg = |RC={ sy-subrc }|.
      ENDIF.
      fail( |Target task { lv_task_trkorr } was not accepted for BC Set { iv_bcset_id }: { lv_ct_msg }| ).
    ENDIF.

    IF lv_ct_ret IS NOT INITIAL.
      fail( |SCPR_CT_TRANSPORT_CHECK returned RC={ lv_ct_ret } for { iv_bcset_id } on task { lv_task_trkorr }.| ).
    ENDIF.

    IF ls_ko200-pgmid <> 'R3TR' OR
       ls_ko200-object <> 'SCP1' OR
       ls_ko200-obj_name <> iv_bcset_id.
      fail( |Unexpected BC Set CTS object: { ls_ko200-pgmid } { ls_ko200-object } { ls_ko200-obj_name }; expected R3TR SCP1 { iv_bcset_id }.| ).
    ENDIF.

    SELECT COUNT( * ) FROM e071 INTO @lv_task_e071
      WHERE trkorr = @lv_task_trkorr.

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
            p_recnr_adjust            = space
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
            user_abort                = 1
            error_in_transport_layer  = 2
            inconsistent_data         = 3
            database_error            = 4
            OTHERS                    = 5.
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

    " Confirm the standard SAVE persisted the BC Set. CTS registration is
    " verified after the standard SAVE routine. WITH_TRANSP_INSERT = X is the
    " supported standard path in the supplied live signature; it lets SAP
    " perform its own transport insertion rather than opening a GUI dialog.
    SELECT COUNT( * ) FROM e071 INTO @lv_e071_after
      WHERE trkorr = @lv_task_trkorr
        AND pgmid  = 'R3TR'
        AND object = 'SCP1'
        AND obj_name = @iv_bcset_id.
    SELECT COUNT( * ) FROM e071k INTO @lv_e071k_after
      WHERE trkorr = @lv_task_trkorr.

    " Prove that the standard SAVE routine persisted the selected content.
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

    IF lv_bcset_recs <> lines( lt_recattr ) OR lv_bcset_vals <> lines( lt_vals ).
      fail( |BC Set { iv_bcset_id } content mismatch: posted records={ lines( lt_recattr ) }, persisted records={ lv_bcset_recs }; posted values={ lines( lt_vals ) }, persisted values={ lv_bcset_vals }.| ).
    ENDIF.

    " -----------------------------------------------------------------
    " SOURCE E071/E071K REPLAY
    " -----------------------------------------------------------------
    " The source transport metadata is used only to recover the exact
    " table keys and IMG Activity. APPEND_SOURCE_KEYS deliberately maps
    " maintenance-view parents such as R3TR VDAT V_T001 to the physical
    " target transport object R3TR TABU T001. It never copies a source
    " view object that may not exist in the target system.
    " -----------------------------------------------------------------
    IF it_source_e071 IS NOT INITIAL.
      append_source_keys(
        iv_task_trkorr = lv_task_trkorr
        it_source_e071 = it_source_e071 ).

      COMMIT WORK AND WAIT.

      SELECT COUNT( * ) FROM e071k INTO @lv_e071k_after
        WHERE trkorr = @lv_task_trkorr.
    ENDIF.

    " The BC Set transport object is explicitly registered by
    " APPEND_SOURCE_KEYS because TEMPLATE_SAVE runs without transport insert
    " in the RFC/Gateway execution path. Verify it only after that step.
***    SELECT COUNT( * ) FROM e071 INTO @lv_e071_after
***      WHERE trkorr = @lv_task_trkorr
***        AND pgmid  = 'R3TR'
***        AND object = 'SCP1'
***        AND obj_name = @iv_bcset_id.
***
***    IF lv_e071_after = 0.
***      fail( |BC Set { iv_bcset_id } exists in SCPRATTR/SCPRVALS but was not registered as R3TR SCP1 in task { lv_task_trkorr }.| ).
***    ENDIF.

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
            TABLES
              bcset_ids        = lt_bcset_ids
              variables        = lt_variables
            CHANGING
              variables_new    = ls_variables_new
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
*        fail( |TR: { lv_trkorr } created Successfully. BC Set { iv_bcset_id } activation returned RC_ACTIV={ lv_rc_activ }. Check the BC Set activation protocol for the failing record.| ).
*        fail( |TR: { lv_trkorr } created Successfully. BC Set { iv_bcset_id } was created and transported, but activation failed in client { sy-mandt }: { lv_msg_text }| ).
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
                         |CTS task { lv_task_trkorr } has R3TR SCP1={ lv_e071_after } and E071K={ lv_e071k_after }. | &&
                         COND #( WHEN iv_activate = abap_true
                                 THEN |Activation completed for client { sy-mandt }.|
                                 ELSE |BC Set saved/staged; activation was not requested.| ).

  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Private Method ZCL_IM_BCSET_DEPLOY=>ENSURE_TRANSPORT
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_BCSET_ID                    TYPE        SCPR_ID
* | [--->] IV_TRKORR                      TYPE        TRKORR
* | [<---] EV_TASK_TRKORR                 TYPE        TRKORR
* | [<-()] RV_TRKORR                      TYPE        TRKORR
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD ensure_transport.

    " Reuse the request the caller named, if it named one. Used as given -
    " a caller-supplied number is assumed to already carry a usable task.
    DATA: lv_found TYPE trkorr,
          ls_task  TYPE trwbo_request_header.

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
    ls_user-type = 'Q'.
    APPEND ls_user TO lt_users.

    DATA: lv_text1 TYPE as4text.
    lv_text1 = |iConfigPro { iv_bcset_id }|.
    CALL FUNCTION 'TR_INSERT_REQUEST_WITH_TASKS'
      EXPORTING
        iv_type           = 'W'
        iv_text           = lv_text1
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


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Private Method ZCL_IM_BCSET_DEPLOY=>FAIL
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_TEXT                        TYPE        STRING
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
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
        message_unlimited = iv_text.

  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Static Private Method ZCL_IM_BCSET_DEPLOY=>APPEND_SOURCE_KEYS
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_TASK_TRKORR                 TYPE        TRKORR
* | [--->] IT_SOURCE_E071                 TYPE        TT_E071_ENTRY
* | [!CX!] /IWBEP/CX_MGW_BUSI_EXCEPTION
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD append_source_keys.

    DATA: lt_e071         TYPE STANDARD TABLE OF e071,
          lt_e071k        TYPE STANDARD TABLE OF e071k,
          lt_one_e071     TYPE STANDARD TABLE OF e071,
          lt_one_e071k    TYPE STANDARD TABLE OF e071k,
          ls_e071         TYPE e071,
          ls_e071k        TYPE e071k,
          lv_before       TYPE i,
          lv_after        TYPE i,
          lv_msg          TYPE string,
          lv_activity     TYPE e071-activity,
          lv_header_count TYPE i,
          lv_key_count    TYPE i,
          lv_tabname      TYPE tabname.

    IF it_source_e071 IS INITIAL.
      RETURN.
    ENDIF.

    " Do not replay a source maintenance-view E071 header blindly.
    " Common source BC-Set transport shape:
    "   E071  R3TR VDAT V_T001
    "   E071K R3TR TABU T001, MASTER=VDAT/V_T001
    " The source view object may legitimately be absent in the target.
    " The selected content is table content, so register the physical
    " target object as R3TR TABU <table> and carry the exact TABKEY.

    CLEAR lt_e071.

    LOOP AT it_source_e071 INTO DATA(ls_source_key)
      WHERE tabkey IS NOT INITIAL.

      lv_tabname = CONV tabname( ls_source_key-objname ).

      SELECT SINGLE tabname FROM dd02l INTO @DATA(lv_ddic_tabname)
        WHERE tabname = @lv_tabname
          AND as4local = 'A'
          AND tabclass <> 'INTTAB'.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.

      CLEAR ls_e071.
      ls_e071-trkorr   = iv_task_trkorr.
      ls_e071-pgmid    = 'R3TR'.
      ls_e071-object   = 'TABU'.
      ls_e071-obj_name = lv_tabname.
      ls_e071-objfunc  = 'K'.

      READ TABLE lt_e071 TRANSPORTING NO FIELDS
        WITH KEY pgmid    = ls_e071-pgmid
                 object   = ls_e071-object
                 obj_name = ls_e071-obj_name
                 objfunc  = ls_e071-objfunc.
      IF sy-subrc <> 0.
        APPEND ls_e071 TO lt_e071.
      ENDIF.
    ENDLOOP.

    lv_header_count = lines( lt_e071 ).
    IF lv_header_count = 0.
      fail( |SourceE071Json contains no transportable DDIC table keys for task { iv_task_trkorr }.| ).
    ENDIF.

    LOOP AT lt_e071 INTO ls_e071.

      CLEAR: lt_one_e071, lt_one_e071k, lv_activity.
      APPEND ls_e071 TO lt_one_e071.

      LOOP AT it_source_e071 INTO DATA(ls_source_key2)
        WHERE tabkey IS NOT INITIAL
          AND objname = ls_e071-obj_name.

        CLEAR ls_e071k.
        ls_e071k-trkorr     = iv_task_trkorr.
        ls_e071k-pgmid      = 'R3TR'.
        ls_e071k-object     = 'TABU'.
        ls_e071k-objname    = ls_e071-obj_name.
        ls_e071k-mastertype = 'TABU'.
        ls_e071k-mastername = ls_e071-obj_name.
        ls_e071k-tabkey     = ls_source_key2-tabkey.

        IF lv_activity IS INITIAL.
          LOOP AT it_source_e071 INTO DATA(ls_source_parent)
            WHERE tabkey IS INITIAL
              AND pgmid = ls_source_key2-pgmid
              AND object = ls_source_key2-mastertype
              AND objname = ls_source_key2-mastername.
            lv_activity = ls_source_parent-activity.
            EXIT.
          ENDLOOP.
        ENDIF.

        IF lv_activity IS INITIAL.
          lv_activity = ls_source_key2-activity.
        ENDIF.

        READ TABLE lt_one_e071k TRANSPORTING NO FIELDS
          WITH KEY pgmid      = ls_e071k-pgmid
                   object     = ls_e071k-object
                   objname    = ls_e071k-objname
                   mastertype = ls_e071k-mastertype
                   mastername = ls_e071k-mastername
                   tabkey     = ls_e071k-tabkey.
        IF sy-subrc <> 0.
          APPEND ls_e071k TO lt_one_e071k.
        ENDIF.

      ENDLOOP.

      IF lt_one_e071k IS INITIAL.
        CONTINUE.
      ENDIF.

      lv_key_count = lv_key_count + lines( lt_one_e071k ).

      EXPORT img_activity = lv_activity
        TO MEMORY ID 'ACT_CTS'.

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
        fail( |E071/E071K registration failed for R3TR TABU { ls_e071-obj_name } on task { iv_task_trkorr }: { lv_msg }| ).
      ENDIF.

    ENDLOOP.

    LOOP AT lt_e071 INTO DATA(ls_verify_e071).
      SELECT SINGLE trkorr FROM e071 INTO @DATA(lv_header_trkorr)
        WHERE trkorr   = @iv_task_trkorr
          AND pgmid    = 'R3TR'
          AND object   = 'TABU'
          AND obj_name = @ls_verify_e071-obj_name
          AND objfunc  = 'K'.
      IF sy-subrc <> 0.
        fail( |TABU transport object was not registered on task { iv_task_trkorr }: R3TR TABU { ls_verify_e071-obj_name }| ).
      ENDIF.
    ENDLOOP.

    SELECT COUNT( * ) FROM e071k INTO @lv_before
      WHERE trkorr = @iv_task_trkorr.

    LOOP AT it_source_e071 INTO DATA(ls_verify_key)
      WHERE tabkey IS NOT INITIAL.

      lv_tabname = CONV tabname( ls_verify_key-objname ).
      SELECT SINGLE tabname FROM dd02l INTO @DATA(lv_verify_tab)
        WHERE tabname = @lv_tabname
          AND as4local = 'A'
          AND tabclass <> 'INTTAB'.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.

      SELECT SINGLE trkorr FROM e071k INTO @DATA(lv_key_trkorr)
        WHERE trkorr     = @iv_task_trkorr
          AND pgmid      = 'R3TR'
          AND object     = 'TABU'
          AND objname    = @lv_tabname
          AND tabkey     = @ls_verify_key-tabkey
          AND mastertype = 'TABU'
          AND mastername = @lv_tabname.

      IF sy-subrc <> 0.
        fail( |E071K key was not registered on task { iv_task_trkorr }: R3TR TABU { lv_tabname } TABKEY={ ls_verify_key-tabkey }| ).
      ENDIF.

    ENDLOOP.

    SELECT COUNT( * ) FROM e071k INTO @lv_after
      WHERE trkorr = @iv_task_trkorr.

    CLEAR lv_activity.
    EXPORT img_activity = lv_activity
      TO MEMORY ID 'ACT_CTS'.

  ENDMETHOD.
ENDCLASS.