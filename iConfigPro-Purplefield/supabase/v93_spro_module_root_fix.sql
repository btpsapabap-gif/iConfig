-- iConfigPro V93 cleanup for legacy V91 branch-derived SPRO hierarchy rows.
-- Runtime V93 already rejects source_system = 'ODATA-BRANCH', so this SQL is
-- optional cleanup rather than a prerequisite for correctness.

BEGIN;

UPDATE public.spro_l1_l6_sequence
   SET hierarchy_complete = FALSE,
       is_active = FALSE,
       updated_at = NOW()
 WHERE UPPER(COALESCE(source_system,'')) = 'ODATA-BRANCH';

COMMIT;

-- Verification:
-- SELECT module_code, module_name, source_system,
--        hierarchy_complete, is_active, COUNT(*) AS node_count
-- FROM public.spro_l1_l6_sequence
-- GROUP BY module_code, module_name, source_system,
--          hierarchy_complete, is_active
-- ORDER BY module_code, source_system;
