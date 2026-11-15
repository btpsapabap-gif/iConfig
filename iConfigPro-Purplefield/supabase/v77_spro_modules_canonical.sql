-- iConfigPro V77: canonical SPRO module codes.
-- Execute after the existing spro_modules table has been created.
-- This migration preserves the existing module_id values by updating rows by
-- their current display names. Project-module foreign keys therefore remain intact.

BEGIN;

ALTER TABLE public.spro_modules
    ALTER COLUMN module_name TYPE VARCHAR(100);

ALTER TABLE public.spro_modules
    ALTER COLUMN module_code TYPE VARCHAR(10);

-- Normalize existing rows by display name.
UPDATE public.spro_modules SET module_name='Enterprise Structure', module_code='ER', display_order=1, is_active=TRUE WHERE lower(trim(module_name))='enterprise structure';
UPDATE public.spro_modules SET module_name='Financial Accounting (New)', module_code='FI', display_order=2, is_active=TRUE WHERE lower(trim(module_name)) IN ('financial accounting','financial accounting (new)');
UPDATE public.spro_modules SET module_name='Controlling', module_code='CO', display_order=3, is_active=TRUE WHERE lower(trim(module_name))='controlling';
UPDATE public.spro_modules SET module_name='Logistics - General', module_code='LG', display_order=4, is_active=TRUE WHERE lower(trim(module_name))='logistics - general';
UPDATE public.spro_modules SET module_name='Sales and Distribution', module_code='SD', display_order=5, is_active=TRUE WHERE lower(trim(module_name))='sales and distribution';
UPDATE public.spro_modules SET module_name='Materials Management', module_code='MM', display_order=6, is_active=TRUE WHERE lower(trim(module_name))='materials management';
UPDATE public.spro_modules SET module_name='Logistics Execution', module_code='LE', display_order=7, is_active=TRUE WHERE lower(trim(module_name)) IN ('logistics execution','warehouse / logistics execution','warehouse/logistics execution');
UPDATE public.spro_modules SET module_name='Quality Management', module_code='QM', display_order=8, is_active=TRUE WHERE lower(trim(module_name))='quality management';
UPDATE public.spro_modules SET module_name='Production', module_code='PD', display_order=9, is_active=TRUE WHERE lower(trim(module_name))='production';
UPDATE public.spro_modules SET module_name='Production Planning for Process Industries', module_code='PP', display_order=10, is_active=TRUE WHERE lower(trim(module_name)) IN ('production planning','production planning for process industries');
UPDATE public.spro_modules SET module_name='Project System', module_code='PS', display_order=11, is_active=TRUE WHERE lower(trim(module_name))='project system';
UPDATE public.spro_modules SET module_name='Time Management', module_code='TM', display_order=12, is_active=TRUE WHERE lower(trim(module_name))='time management';
UPDATE public.spro_modules SET module_name='Payroll', module_code='PY', display_order=13, is_active=TRUE WHERE lower(trim(module_name))='payroll';
UPDATE public.spro_modules SET module_name='Personnel Management', module_code='PM', display_order=14, is_active=TRUE WHERE lower(trim(module_name))='personnel management';

-- Insert any catalog entry not present by either canonical code or display name.
INSERT INTO public.spro_modules (module_code,module_name,display_order,is_active)
SELECT v.code,v.name,v.display_order,TRUE
FROM (VALUES
  ('ER','Enterprise Structure',1),
  ('FI','Financial Accounting (New)',2),
  ('CO','Controlling',3),
  ('LG','Logistics - General',4),
  ('SD','Sales and Distribution',5),
  ('MM','Materials Management',6),
  ('LE','Logistics Execution',7),
  ('QM','Quality Management',8),
  ('PD','Production',9),
  ('PP','Production Planning for Process Industries',10),
  ('PS','Project System',11),
  ('TM','Time Management',12),
  ('PY','Payroll',13),
  ('PM','Personnel Management',14)
) AS v(code,name,display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.spro_modules m
  WHERE upper(trim(m.module_code))=v.code
     OR lower(trim(m.module_name))=lower(v.name)
);

UPDATE public.spro_modules m
SET display_order=v.display_order,
    module_name=v.name,
    is_active=TRUE
FROM (VALUES
  ('ER','Enterprise Structure',1),
  ('FI','Financial Accounting (New)',2),
  ('CO','Controlling',3),
  ('LG','Logistics - General',4),
  ('SD','Sales and Distribution',5),
  ('MM','Materials Management',6),
  ('LE','Logistics Execution',7),
  ('QM','Quality Management',8),
  ('PD','Production',9),
  ('PP','Production Planning for Process Industries',10),
  ('PS','Project System',11),
  ('TM','Time Management',12),
  ('PY','Payroll',13),
  ('PM','Personnel Management',14)
) AS v(code,name,display_order)
WHERE upper(trim(m.module_code))=v.code;

UPDATE public.spro_modules
SET is_active=FALSE
WHERE upper(trim(module_code)) NOT IN ('ER','FI','CO','LG','SD','MM','LE','QM','PD','PP','PS','TM','PY','PM');

COMMIT;

SELECT module_id,module_code,module_name,display_order,is_active
FROM public.spro_modules
WHERE is_active=TRUE
ORDER BY display_order;
