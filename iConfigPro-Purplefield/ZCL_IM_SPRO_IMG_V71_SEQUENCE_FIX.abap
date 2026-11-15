CLASS zcl_im_spro_img DEFINITION
    PUBLIC
    FINAL
    CREATE PUBLIC.
 
   PUBLIC SECTION.
 
     TYPES:
       BEGIN OF ty_hierarchy,
         activity             TYPE cus_imgach-activity,
         tree_id              TYPE hier_iface-tree_id,
         node_id              TYPE hier_iface-node_id,
         parent_node_id       TYPE hier_iface-parent_id,
         node_level           TYPE hier_iface-node_level,
         node_type            TYPE hier_iface-node_type,
         tree_text            TYPE hier_texts-text,
         node_text            TYPE hier_texts-text,
         reference_type       TYPE hier_ref-ref_type,
         reference_object     TYPE hier_ref-ref_object,
         customizing_object   TYPE hier_ref-ref_object,
         object_type          TYPE cus_actobj-objecttype,
         object_name          TYPE cus_actobj-objectname,
         table_name           TYPE string,
         transaction          TYPE cus_imgach-tcode,
         customizing_activity TYPE cus_imgach-c_activity,
         is_img_activity      TYPE abap_bool,
         is_table             TYPE abap_bool,
       END OF ty_hierarchy.
 
     TYPES:
       tt_hierarchy TYPE STANDARD TABLE OF ty_hierarchy
                     WITH DEFAULT KEY.
 
     CLASS-METHODS get_module_hierarchy
       IMPORTING
         iv_module           TYPE hier_texts-text
         iv_language         TYPE spras DEFAULT sy-langu
       RETURNING
         VALUE(rt_hierarchy) TYPE tt_hierarchy.
 
     CLASS-METHODS get_activity_hierarchy
       IMPORTING
         iv_activity         TYPE cus_imgach-activity
         iv_language         TYPE spras DEFAULT sy-langu
       RETURNING
         VALUE(rt_hierarchy) TYPE tt_hierarchy.
 
   PRIVATE SECTION.
 
     TYPES:
       tt_hier_iface TYPE STANDARD TABLE OF hier_iface
                      WITH DEFAULT KEY.
 
     TYPES:
       tt_hier_ref TYPE STANDARD TABLE OF hier_ref
                    WITH DEFAULT KEY.
 
     TYPES:
       tt_hier_texts TYPE STANDARD TABLE OF hier_texts
                      WITH DEFAULT KEY.
 
     TYPES:
       tt_ttreet TYPE STANDARD TABLE OF ttreet
                   WITH DEFAULT KEY.
 
     TYPES:
       tt_ttreetree TYPE STANDARD TABLE OF ttreet
                     WITH DEFAULT KEY.
 
     CLASS-METHODS get_structure_id
       IMPORTING
         iv_module              TYPE hier_texts-text
         iv_language            TYPE spras
       RETURNING
         VALUE(rv_structure_id) TYPE hier_iface-tree_id.
 
     CLASS-METHODS read_hierarchy
       IMPORTING
         iv_structure_id TYPE hier_iface-tree_id
         iv_language     TYPE spras
       EXPORTING
         et_nodes        TYPE tt_hier_iface
         et_references   TYPE tt_hier_ref
         et_texts        TYPE tt_hier_texts.
 
     CLASS-METHODS build_result
       IMPORTING
         iv_language         TYPE spras
         it_nodes            TYPE tt_hier_iface
         it_references       TYPE tt_hier_ref
         it_texts            TYPE tt_hier_texts
       RETURNING
         VALUE(rt_hierarchy) TYPE tt_hierarchy.
 
     CLASS-METHODS read_activity_compatibility
       IMPORTING
         iv_activity         TYPE cus_imgach-activity
         iv_language         TYPE spras
       RETURNING
         VALUE(rt_hierarchy) TYPE tt_hierarchy.
 
     CLASS-METHODS resolve_reference
       IMPORTING
         iv_reference_type   TYPE hier_ref-ref_type
         iv_reference_object TYPE hier_ref-ref_object
       CHANGING
         cs_result           TYPE ty_hierarchy.
 
 ENDCLASS.
 
 
 
 CLASS ZCL_IM_SPRO_IMG IMPLEMENTATION.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Private Method ZCL_IM_SPRO_IMG=>BUILD_RESULT
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS
 \* | [--->] IT_NODES                       TYPE        TT_HIER_IFACE
 \* | [--->] IT_REFERENCES                  TYPE        TT_HIER_REF
 \* | [--->] IT_TEXTS                       TYPE        TT_HIER_TEXTS
 \* | [<-()] RT_HIERARCHY                   TYPE        TT_HIERARCHY
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD build_result.
 
     DATA:
       ls_node      TYPE hier_iface,
       ls_text      TYPE hier_texts,
       ls_reference TYPE hier_ref,
       ls_tree_text TYPE ttreet,
       ls_result    TYPE ty_hierarchy,
       lv_found     TYPE abap_bool.
 
     CLEAR rt_hierarchy.
 
     IF it_nodes IS INITIAL.
       RETURN.
     ENDIF.
 
 
     LOOP AT it_nodes INTO ls_node.
 
       CLEAR ls_result.
 
       ls_result-tree_id       = ls_node-tree_id.
       ls_result-node_id       = ls_node-node_id.
       ls_result-parent_node_id = ls_node-parent_id.
       ls_result-node_level    = ls_node-node_level.
       ls_result-node_type     = ls_node-node_type.
 
 
       "------------------------------------------------------------
       " Tree text
       "------------------------------------------------------------
       CLEAR ls_tree_text.
 
       SELECT SINGLE \*
         FROM ttreet
         INTO ls_tree_text
         WHERE spras = iv_language
           AND id    = ls_node-tree_id.
 
       IF sy-subrc <> 0.
 
         CLEAR ls_tree_text.
 
         SELECT SINGLE \*
           FROM ttreet
           INTO ls_tree_text
           WHERE spras = 'E'
             AND id    = ls_node-tree_id.
 
       ENDIF.
 
       IF sy-subrc <> 0.
 
         CLEAR ls_tree_text.
 
         SELECT SINGLE \*
           FROM ttreet
           INTO ls_tree_text
           WHERE id = ls_node-tree_id.
 
       ENDIF.
 
       IF sy-subrc = 0.
         ls_result-tree_text = ls_tree_text-text.
       ENDIF.
 
 
       "------------------------------------------------------------
       " Node text - requested language
       "------------------------------------------------------------
       CLEAR:
         ls_text,
         lv_found.
 
       READ TABLE it_texts
         INTO ls_text
         WITH KEY
           spras   = iv_language
           node_id = ls_node-node_id.
 
       IF sy-subrc = 0.
         ls_result-node_text = ls_text-text.
         lv_found = abap_true.
       ENDIF.
 
 
       "------------------------------------------------------------
       " Node text - English fallback
       "------------------------------------------------------------
       IF lv_found = abap_false.
 
         CLEAR ls_text.
 
         READ TABLE it_texts
           INTO ls_text
           WITH KEY
             spras   = 'E'
             node_id = ls_node-node_id.
 
         IF sy-subrc = 0.
           ls_result-node_text = ls_text-text.
           lv_found = abap_true.
         ENDIF.
 
       ENDIF.
 
 
       "------------------------------------------------------------
       " Node text - any available language fallback
       "------------------------------------------------------------
       IF lv_found = abap_false.
 
         CLEAR ls_text.
 
         READ TABLE it_texts
           INTO ls_text
           WITH KEY
             node_id = ls_node-node_id.
 
         IF sy-subrc = 0.
           ls_result-node_text = ls_text-text.
         ENDIF.
 
       ENDIF.
 
 
       "------------------------------------------------------------
       " References for this node
       "
       " ACTI:
       "   supplies the IMG activity reference when present.
       "
       " COBJ:
       "   supplies the customizing object / IMG object.
       "
       " R_SEQUEN is the correct HIER_REF component.
       "------------------------------------------------------------
 
       LOOP AT it_references INTO ls_reference
         WHERE node_id = ls_node-node_id.
 
         IF ls_reference-ref_type = 'ACTI'.
 
           IF ls_result-activity IS INITIAL.
             ls_result-activity = ls_reference-ref_object.
           ENDIF.
 
         ELSEIF ls_reference-ref_type = 'COBJ'.
 
           IF ls_result-reference_type IS INITIAL.
             ls_result-reference_type = ls_reference-ref_type.
           ENDIF.
 
           IF ls_result-reference_object IS INITIAL.
             ls_result-reference_object =
               ls_reference-ref_object.
           ENDIF.
 
           IF ls_result-customizing_object IS INITIAL.
             ls_result-customizing_object =
               ls_reference-ref_object.
           ENDIF.
 
         ENDIF.
 
         resolve_reference(
           EXPORTING
             iv_reference_type   = ls_reference-ref_type
             iv_reference_object = ls_reference-ref_object
           CHANGING
             cs_result           = ls_result ).
 
       ENDLOOP.
 
       APPEND ls_result TO rt_hierarchy.
 
     ENDLOOP.
 
 
     "--------------------------------------------------------------
     " Preserve the exact hierarchy order returned by
     " STREE_HIERARCHY_READ. Do NOT sort RT_HIERARCHY.
     " Sorting by NODE_ID / NODE_LEVEL destroys the SAP IMG
     " sibling presentation order and therefore corrupts the
     " downstream OData -> Supabase sequence_no.
     "--------------------------------------------------------------
 
   ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Public Method ZCL_IM_SPRO_IMG=>GET_ACTIVITY_HIERARCHY
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_ACTIVITY                    TYPE        CUS_IMGACH-ACTIVITY
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS (default =SY-LANGU)
 \* | [<-()] RT_HIERARCHY                   TYPE        TT_HIERARCHY
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD get_activity_hierarchy.
 
     CLEAR rt_hierarchy.
 
     IF iv_activity IS INITIAL.
       RETURN.
     ENDIF.
 
     rt_hierarchy = read_activity_compatibility(
       iv_activity = iv_activity
       iv_language = iv_language ).
 
   ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Public Method ZCL_IM_SPRO_IMG=>GET_MODULE_HIERARCHY
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_MODULE                      TYPE        HIER_TEXTS-TEXT
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS (default =SY-LANGU)
 \* | [<-()] RT_HIERARCHY                   TYPE        TT_HIERARCHY
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD get_module_hierarchy.
 
     DATA:
       lv_structure_id TYPE hier_iface-tree_id,
       lt_nodes        TYPE tt_hier_iface,
       lt_references   TYPE tt_hier_ref,
       lt_texts        TYPE tt_hier_texts.
 
     CLEAR rt_hierarchy.
 
     IF iv_module IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " 1. Resolve selected module text in TTREET
     "--------------------------------------------------------------
     lv_structure_id = get_structure_id(
       iv_module   = iv_module
       iv_language = iv_language ).
 
     IF lv_structure_id IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " 2. Read the real SAP hierarchy directly
     "
     "    IMPORTANT:
     "    TTREET-ID is passed directly to
     "    STREE_HIERARCHY_READ.
     "
     "    STREE_STRUCTURE_READ is intentionally NOT used here.
     "--------------------------------------------------------------
     read_hierarchy(
       EXPORTING
         iv_structure_id = lv_structure_id
         iv_language     = iv_language
       IMPORTING
         et_nodes        = lt_nodes
         et_references   = lt_references
         et_texts        = lt_texts ).
 
 
     IF lt_nodes IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " 3. Build application result from the real hierarchy
     "--------------------------------------------------------------
     rt_hierarchy = build_result(
       iv_language   = iv_language
       it_nodes      = lt_nodes
       it_references = lt_references
       it_texts      = lt_texts ).
 
   ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Private Method ZCL_IM_SPRO_IMG=>GET_STRUCTURE_ID
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_MODULE                      TYPE        HIER_TEXTS-TEXT
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS
 \* | [<-()] RV_STRUCTURE_ID                TYPE        HIER_IFACE-TREE_ID
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD get_structure_id.

    DATA:
      lv_language     TYPE spras,
      lv_module       TYPE hier_texts-text,
      lv_module_cap   TYPE hier_texts-text.

    CLEAR rv_structure_id.

    lv_module = iv_module.
    lv_module_cap = iv_module.
    TRANSLATE lv_module_cap TO UPPER CASE.

    "--------------------------------------------------------------
    " IMPORTANT:
    " TTREET is the language-dependent text table. The same text can
    " exist for more than one hierarchy structure. The SAP SPRO
    " hierarchy is identified by TTREE-TYPE = 'IMG'.
    "
    " The previous implementation used SELECT SINGLE directly on
    " TTREET by text. That can select a different structure when the
    " same description exists in another hierarchy. The result is then
    " a valid hierarchy, but it is NOT the SPRO module hierarchy.
    "
    " Always resolve the structure through TTREE and restrict it to
    " the SAP IMG structure type before STREE_HIERARCHY_READ_ALL_SUBS.
    "--------------------------------------------------------------

    "--------------------------------------------------------------
    " Primary lookup: requested language + IMG structure + exact text
    "--------------------------------------------------------------
    SELECT SINGLE tt~id
      FROM ttree AS tt
      INNER JOIN ttreet AS tx
        ON tx~id = tt~id
      INTO rv_structure_id
      WHERE tt~type = 'IMG'
        AND tx~spras = iv_language
        AND tx~text_cap = lv_module_cap.

    IF sy-subrc = 0.
      RETURN.
    ENDIF.

    "--------------------------------------------------------------
    " English fallback: still restricted to the SAP IMG hierarchy
    "--------------------------------------------------------------
    lv_language = 'E'.

    SELECT SINGLE tt~id
      FROM ttree AS tt
      INNER JOIN ttreet AS tx
        ON tx~id = tt~id
      INTO rv_structure_id
      WHERE tt~type = 'IMG'
        AND tx~spras = lv_language
        AND tx~text_cap = lv_module_cap.

    IF sy-subrc = 0.
      RETURN.
    ENDIF.

    "--------------------------------------------------------------
    " Final fallback: requested display text, still restricted to IMG.
    " This handles systems where TEXT_CAP is not populated exactly as
    " expected while preventing a non-IMG hierarchy from being selected.
    "--------------------------------------------------------------
    SELECT SINGLE tt~id
      FROM ttree AS tt
      INNER JOIN ttreet AS tx
        ON tx~id = tt~id
      INTO rv_structure_id
      WHERE tt~type = 'IMG'
        AND tx~text = lv_module.

    IF sy-subrc <> 0.
      CLEAR rv_structure_id.
    ENDIF.

  ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Private Method ZCL_IM_SPRO_IMG=>READ_ACTIVITY_COMPATIBILITY
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_ACTIVITY                    TYPE        CUS_IMGACH-ACTIVITY
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS
 \* | [<-()] RT_HIERARCHY                   TYPE        TT_HIERARCHY
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD read_activity_compatibility.
 
     DATA:
       lt_input_refs TYPE tt_hier_ref,
       lt_nodes      TYPE tt_hier_iface,
       lt_refs       TYPE tt_hier_ref,
       lt_texts      TYPE tt_hier_texts,
       lt_treetypes  TYPE STANDARD TABLE OF ttreetype
                      WITH DEFAULT KEY,
       ls_ref        TYPE hier_ref,
       ls_treetype   TYPE ttreetype,
       ls_node       TYPE hier_iface,
       lv_structure  TYPE hier_iface-tree_id.
 
     CLEAR rt_hierarchy.
 
 
     "--------------------------------------------------------------
     " Compatibility path for an explicit IMG activity.
     "
     " This is NOT used by GET_MODULE_HIERARCHY.
     " Module hierarchy remains TTREET -> STREE_HIERARCHY_READ.
     "--------------------------------------------------------------
     CLEAR ls_ref.
 
     ls_ref-ref_type = 'COBJ'.
     ls_ref-ref_object = iv_activity.
 
     APPEND ls_ref TO lt_input_refs.
 
 
     CLEAR ls_treetype.
 
     ls_treetype-tree_type = 'IMG'.
 
     APPEND ls_treetype TO lt_treetypes.
 
 
     CALL FUNCTION 'STREE_GET_NODES_FOR_GIVEN_REF'
       EXPORTING
         check_selected_tree_types = 'X'
       TABLES
         i_list_of_references      = lt_input_refs
         i_treetypes               = lt_treetypes
         e_list_of_nodes           = lt_nodes
         e_list_of_references      = lt_refs
       EXCEPTIONS
         OTHERS                    = 1.
 
 
     IF sy-subrc <> 0.
       CLEAR:
         lt_nodes,
         lt_refs.
       RETURN.
     ENDIF.
 
 
     IF lt_nodes IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " Use the actual TREE_ID returned by SAP and then read the
     " complete hierarchy directly with STREE_HIERARCHY_READ.
     "--------------------------------------------------------------
     READ TABLE lt_nodes INTO ls_node INDEX 1.
 
     IF sy-subrc <> 0.
       RETURN.
     ENDIF.
 
     lv_structure = ls_node-tree_id.
 
     IF lv_structure IS INITIAL.
       RETURN.
     ENDIF.
 
 
     read_hierarchy(
       EXPORTING
         iv_structure_id = lv_structure
         iv_language     = iv_language
       IMPORTING
         et_nodes        = lt_nodes
         et_references   = lt_refs
         et_texts        = lt_texts ).
 
 
     IF lt_nodes IS INITIAL.
       RETURN.
     ENDIF.
 
 
     rt_hierarchy = build_result(
       iv_language   = iv_language
       it_nodes      = lt_nodes
       it_references = lt_refs
       it_texts      = lt_texts ).
 
   ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Private Method ZCL_IM_SPRO_IMG=>READ_HIERARCHY
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_STRUCTURE_ID                TYPE        HIER_IFACE-TREE_ID
 \* | [--->] IV_LANGUAGE                    TYPE        SPRAS
 \* | [<---] ET_NODES                       TYPE        TT_HIER_IFACE
 \* | [<---] ET_REFERENCES                  TYPE        TT_HIER_REF
 \* | [<---] ET_TEXTS                       TYPE        TT_HIER_TEXTS
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD read_hierarchy.
 
     DATA:
       lt_nodes_current      TYPE tt_hier_iface,
       lt_references_current TYPE tt_hier_ref,
       lt_texts_current      TYPE tt_hier_texts.
 
     CLEAR:
       et_nodes,
       et_references,
       et_texts.
 
 
     IF iv_structure_id IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " Read the real SAP IMG hierarchy.
     "
     " Verified interface:
     "
     " STRUCTURE_ID
     " READ_ALSO_TEXTS
     " LANGUAGE
     " DISPLAY_MODE
     "
     " LIST_OF_NODES
     " LIST_OF_REFERENCES
     " LIST_OF_TEXTS
     "--------------------------------------------------------------
     CALL FUNCTION 'STREE_HIERARCHY_READ'
       EXPORTING
         structure_id       = iv_structure_id
         read_also_texts    = 'X'
         language           = iv_language
         display_mode       = 'D'
       TABLES
         list_of_nodes      = lt_nodes_current
         list_of_references = lt_references_current
         list_of_texts      = lt_texts_current
       EXCEPTIONS
         OTHERS             = 1.
 
 
     IF sy-subrc <> 0.
       CLEAR:
         et_nodes,
         et_references,
         et_texts.
       RETURN.
     ENDIF.
 
 
     IF lt_nodes_current IS INITIAL.
       RETURN.
     ENDIF.
 
 
     "--------------------------------------------------------------
     " Preserve the complete hierarchy returned for THIS structure.
     "
     " Do not resolve activities first.
     " Do not call STREE_STRUCTURE_READ.
     " Do not recursively follow REFTREE_ID yet.
     "--------------------------------------------------------------
     et_nodes = lt_nodes_current.
     et_references = lt_references_current.
     et_texts = lt_texts_current.
 
 
     " Preserve the exact order returned by STREE_HIERARCHY_READ.
     " Do NOT sort ET_NODES here: SAP's returned hierarchy order is
     " the source of truth for sibling sequence.
     " Duplicate removal, if ever required, must not reorder ET_NODES.
 
 
     SORT et_references BY node_id ref_type ref_object r_sequen.
     DELETE ADJACENT DUPLICATES FROM et_references
       COMPARING node_id ref_type ref_object r_sequen.
 
 
     SORT et_texts BY spras node_id.
     DELETE ADJACENT DUPLICATES FROM et_texts
       COMPARING spras node_id.
 
   ENDMETHOD.
 
 
 \* \<SIGNATURE>---------------------------------------------------------------------------------------+
 \* | Static Private Method ZCL_IM_SPRO_IMG=>RESOLVE_REFERENCE
 \* +-------------------------------------------------------------------------------------------------+
 \* | [--->] IV_REFERENCE_TYPE              TYPE        HIER_REF-REF_TYPE
 \* | [--->] IV_REFERENCE_OBJECT            TYPE        HIER_REF-REF_OBJECT
 \* | [<-->] CS_RESULT                      TYPE        TY_HIERARCHY
 \* +--------------------------------------------------------------------------------------\</SIGNATURE>
   METHOD resolve_reference.
 
     DATA:
       ls_imgach      TYPE cus_imgach,
       ls_actobj      TYPE cus_actobj,
       lt_view_tables TYPE STANDARD TABLE OF dd26s
                         WITH DEFAULT KEY,
       ls_view_table  TYPE dd26s,
       lv_activity    TYPE cus_imgach-activity,
       lv_c_activity  TYPE cus_imgach-c_activity,
       lv_tabname     TYPE dd26s-tabname,
       lv_table_list  TYPE string,
       lt_table_names TYPE STANDARD TABLE OF string WITH EMPTY KEY.
 
     CLEAR:
       lv_activity,
       lv_c_activity.
 
     IF cs_result-table_name IS NOT INITIAL.
       SPLIT cs_result-table_name AT ',' INTO TABLE lt_table_names.
     ENDIF.
 
     IF iv_reference_object IS INITIAL.
       RETURN.
     ENDIF.
 
     SELECT SINGLE \*
       FROM cus_imgach
       INTO ls_imgach
       WHERE activity = iv_reference_object.
 
     IF sy-subrc <> 0.
       SELECT SINGLE \*
         FROM cus_imgach
         INTO ls_imgach
         WHERE c_activity = iv_reference_object.
     ENDIF.
 
     IF sy-subrc = 0.
       lv_activity = ls_imgach-activity.
       lv_c_activity = ls_imgach-c_activity.
       cs_result-activity = ls_imgach-activity.
       cs_result-customizing_activity = ls_imgach-c_activity.
       cs_result-transaction = ls_imgach-tcode.
       cs_result-is_img_activity = abap_true.
     ENDIF.
 
     CLEAR ls_actobj.
 
     SELECT SINGLE \*
       FROM cus_actobj
       INTO ls_actobj
       WHERE act_id = iv_reference_object.
 
     IF sy-subrc <> 0 AND lv_c_activity IS NOT INITIAL.
       SELECT SINGLE \*
         FROM cus_actobj
         INTO ls_actobj
         WHERE act_id = lv_c_activity.
     ENDIF.
 
     IF sy-subrc <> 0 AND lv_activity IS NOT INITIAL.
       SELECT SINGLE \*
         FROM cus_actobj
         INTO ls_actobj
         WHERE act_id = lv_activity.
     ENDIF.
 
     IF sy-subrc <> 0.
       CLEAR ls_actobj.
     ENDIF.
 
     IF ls_actobj-act_id IS NOT INITIAL.
       cs_result-object_type = ls_actobj-objecttype.
       cs_result-object_name = ls_actobj-objectname.
 
       IF cs_result-transaction IS INITIAL.
         cs_result-transaction = ls_actobj-tcode.
       ENDIF.
 
       IF ls_actobj-objecttype = 'S'.
         lv_tabname = ls_actobj-objectname.
 
         IF lv_tabname IS NOT INITIAL.
           cs_result-is_table = abap_true.
           INSERT lv_tabname INTO TABLE lt_table_names.
         ENDIF.
 
       ELSEIF ls_actobj-objecttype = 'V'.
 
         CLEAR lt_view_tables.
 
         SELECT \*
           FROM dd26s
           INTO TABLE lt_view_tables
           WHERE viewname = ls_actobj-objectname.
 
         LOOP AT lt_view_tables INTO ls_view_table.
           IF ls_view_table-tabname IS INITIAL.
             CONTINUE.
           ENDIF.
 
           INSERT ls_view_table-tabname INTO TABLE lt_table_names.
         ENDLOOP.
 
         IF lt_table_names IS NOT INITIAL.
           cs_result-is_table = abap_true.
         ENDIF.
       ENDIF.
     ENDIF.
 
     IF iv_reference_type = 'ACTI'.
       IF cs_result-activity IS INITIAL.
         cs_result-activity = iv_reference_object.
         cs_result-is_img_activity = abap_true.
       ENDIF.
     ENDIF.
 
     CLEAR lv_table_list.
 
     LOOP AT lt_table_names INTO lv_tabname.
       IF lv_table_list IS INITIAL.
         lv_table_list = lv_tabname.
       ELSE.
         CONCATENATE lv_table_list lv_tabname
           INTO lv_table_list SEPARATED BY ','.
       ENDIF.
     ENDLOOP.
 
     cs_result-table_name = lv_table_list.
 
   ENDMETHOD.
 ENDCLASS.   