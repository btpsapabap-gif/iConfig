-- iConfigPro V91 prerequisite/upgrade migration.
-- Safe to run after V90. If V90 was skipped, this creates the completeness
-- column required by the runtime cache contract.

BEGIN;

ALTER TABLE public.spro_l1_l6_sequence
    ADD COLUMN IF NOT EXISTS hierarchy_complete BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_spro_l1_l6_complete_lookup
    ON public.spro_l1_l6_sequence
       (module_code, language, hierarchy_complete, is_active, level_no, sequence_no);

COMMIT;

-- Verification:
-- SELECT module_code, module_name, source_system, hierarchy_complete, COUNT(*) AS node_count
-- FROM public.spro_l1_l6_sequence
-- GROUP BY module_code, module_name, source_system, hierarchy_complete
-- ORDER BY module_code, source_system, hierarchy_complete;
