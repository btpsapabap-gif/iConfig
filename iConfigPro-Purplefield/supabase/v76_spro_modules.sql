-- iConfigPro V76: canonical SPRO module catalog.
-- Preserves existing module IDs where the old catalog can be matched, adds the
-- requested modules, and deactivates modules that are no longer part of the
-- application catalog.
-- Run this in the actual Supabase SQL editor.

BEGIN;

-- Rename existing catalog entries where the requested catalog is a direct
-- evolution of the current module. This preserves project-module foreign keys.
UPDATE public.spro_modules
SET module_name = 'Financial Accounting (New)',
    module_code = 'financial-accounting-new',
    display_order = 2,
    is_active = TRUE
WHERE lower(trim(module_name)) = 'financial accounting'
   OR lower(trim(module_code)) = 'financial-accounting';

UPDATE public.spro_modules
SET module_name = 'Logistics Execution',
    module_code = 'logistics-execution',
    display_order = 7,
    is_active = TRUE
WHERE lower(trim(module_name)) IN ('warehouse / logistics execution', 'warehouse/logistics execution', 'logistics execution')
   OR lower(trim(module_code)) IN ('warehouse-logistics-execution', 'logistics-execution');

-- Existing Production Planning is retained as the closest match for the new
-- Process Industries entry so existing project assignments are not discarded.
UPDATE public.spro_modules
SET module_name = 'Production Planning for Process Industries',
    module_code = 'production-planning-for-process-industries',
    display_order = 10,
    is_active = TRUE
WHERE lower(trim(module_name)) = 'production planning'
   OR lower(trim(module_code)) = 'production-planning';

-- Preserve existing modules by name/code and create any missing requested rows.
INSERT INTO public.spro_modules (module_code, module_name, display_order, is_active)
SELECT v.module_code, v.module_name, v.display_order, TRUE
FROM (VALUES
  ('enterprise-structure','Enterprise Structure',1),
  ('financial-accounting-new','Financial Accounting (New)',2),
  ('controlling','Controlling',3),
  ('logistics-general','Logistics - General',4),
  ('sales-and-distribution','Sales and Distribution',5),
  ('materials-management','Materials Management',6),
  ('logistics-execution','Logistics Execution',7),
  ('quality-management','Quality Management',8),
  ('production','Production',9),
  ('production-planning-for-process-industries','Production Planning for Process Industries',10),
  ('project-system','Project System',11),
  ('time-management','Time Management',12),
  ('payroll','Payroll',13),
  ('personnel-management','Personnel Management',14)
) AS v(module_code,module_name,display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.spro_modules m
  WHERE lower(trim(m.module_code)) = lower(trim(v.module_code))
     OR lower(trim(m.module_name)) = lower(trim(v.module_name))
);

-- Normalize display order and activate only the requested catalog.
UPDATE public.spro_modules m
SET display_order = v.display_order,
    module_name = v.module_name,
    is_active = TRUE
FROM (VALUES
  ('enterprise-structure','Enterprise Structure',1),
  ('financial-accounting-new','Financial Accounting (New)',2),
  ('controlling','Controlling',3),
  ('logistics-general','Logistics - General',4),
  ('sales-and-distribution','Sales and Distribution',5),
  ('materials-management','Materials Management',6),
  ('logistics-execution','Logistics Execution',7),
  ('quality-management','Quality Management',8),
  ('production','Production',9),
  ('production-planning-for-process-industries','Production Planning for Process Industries',10),
  ('project-system','Project System',11),
  ('time-management','Time Management',12),
  ('payroll','Payroll',13),
  ('personnel-management','Personnel Management',14)
) AS v(module_code,module_name,display_order)
WHERE lower(trim(m.module_code)) = lower(trim(v.module_code));

UPDATE public.spro_modules
SET is_active = FALSE
WHERE module_code NOT IN (
  'enterprise-structure',
  'financial-accounting-new',
  'controlling',
  'logistics-general',
  'sales-and-distribution',
  'materials-management',
  'logistics-execution',
  'quality-management',
  'production',
  'production-planning-for-process-industries',
  'project-system',
  'time-management',
  'payroll',
  'personnel-management'
);

COMMIT;

-- Verify:
-- SELECT module_id,module_code,module_name,display_order,is_active
-- FROM public.spro_modules
-- WHERE is_active = TRUE
-- ORDER BY display_order;
