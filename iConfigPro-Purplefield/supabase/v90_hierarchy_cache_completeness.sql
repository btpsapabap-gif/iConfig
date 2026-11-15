-- iConfigPro V90: mark hierarchy cache rows as complete only after a
-- successful SAP OData hierarchy load. Existing cache rows are deliberately
-- marked incomplete so stale/partial module branches (for example MM with
-- only a root + one child) are not treated as authoritative.

BEGIN;

ALTER TABLE public.spro_l1_l6_sequence
    ADD COLUMN IF NOT EXISTS hierarchy_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing rows were created before the completeness contract existed.
-- They must be refreshed from SAP OData once, rather than trusted as a
-- possibly partial cache.
UPDATE public.spro_l1_l6_sequence
SET hierarchy_complete = FALSE
WHERE hierarchy_complete IS DISTINCT FROM FALSE;

CREATE INDEX IF NOT EXISTS ix_spro_l1_l6_complete_lookup
    ON public.spro_l1_l6_sequence
       (module_code, language, hierarchy_complete, is_active, level_no, sequence_no);

COMMIT;

-- Verification:
-- SELECT module_code, module_name, hierarchy_complete, COUNT(*) AS node_count
-- FROM public.spro_l1_l6_sequence
-- GROUP BY module_code, module_name, hierarchy_complete
-- ORDER BY module_code, hierarchy_complete;
