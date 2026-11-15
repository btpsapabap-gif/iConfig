-- iConfigPro V77: canonical module-code relationship between project modules
-- and the L1-L6 Process Directory.
-- Run after the spro_modules catalog has been normalized.

BEGIN;

ALTER TABLE public.spro_l1_l6_sequence
    ADD COLUMN IF NOT EXISTS module_code VARCHAR(10);

-- Backfill the existing hierarchy cache from the SAP IMG labels currently
-- present in the table. These are compatibility mappings, not invented IMG data.
UPDATE public.spro_l1_l6_sequence
SET module_code = CASE UPPER(TRIM(module_name))
    WHEN 'ENTERPRISE STRUCTURE' THEN 'ER'
    WHEN 'FINANCIAL ACCOUNTING' THEN 'FI'
    WHEN 'FINANCIAL ACCOUNTING (NEW)' THEN 'FI'
    WHEN 'CONTROLLING' THEN 'CO'
    WHEN 'LOGISTICS - GENERAL' THEN 'LG'
    WHEN 'SALES AND DISTRIBUTION' THEN 'SD'
    WHEN 'MATERIALS MANAGEMENT' THEN 'MM'
    WHEN 'LOGISTICS EXECUTION' THEN 'LE'
    WHEN 'WAREHOUSE / LOGISTICS EXECUTION' THEN 'LE'
    WHEN 'WAREHOUSE/LOGISTICS EXECUTION' THEN 'LE'
    WHEN 'QUALITY MANAGEMENT' THEN 'QM'
    WHEN 'PRODUCTION' THEN 'PD'
    WHEN 'PRODUCTION PLANNING' THEN 'PP'
    WHEN 'PRODUCTION PLANNING FOR PROCESS INDUSTRIES' THEN 'PP'
    WHEN 'PROJECT SYSTEM' THEN 'PS'
    WHEN 'TIME MANAGEMENT' THEN 'TM'
    WHEN 'PAYROLL' THEN 'PY'
    WHEN 'PERSONNEL MANAGEMENT' THEN 'PM'
    ELSE module_code
END
WHERE module_code IS NULL OR TRIM(module_code) = '';

ALTER TABLE public.spro_l1_l6_sequence
    DROP CONSTRAINT IF EXISTS uq_spro_l1_l6_module_code_node;

ALTER TABLE public.spro_l1_l6_sequence
    ADD CONSTRAINT uq_spro_l1_l6_module_code_node
    UNIQUE (module_code, language, tree_id, node_id);

CREATE INDEX IF NOT EXISTS ix_spro_l1_l6_module_code
    ON public.spro_l1_l6_sequence(module_code, language, is_active, level_no, sequence_no);

-- Make the relationship explicit for newly maintained hierarchy rows.
-- Existing module_name remains for SAP/display provenance.

COMMIT;

-- Verification:
-- SELECT module_code, module_name, COUNT(*) AS node_count
-- FROM public.spro_l1_l6_sequence
-- WHERE is_active = TRUE
-- GROUP BY module_code, module_name
-- ORDER BY module_code, module_name;
