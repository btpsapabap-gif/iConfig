-- iConfigPro V72 migration: Gold deployment versions + audit log
-- Run this in the actual Supabase SQL editor.
-- The backend uses the service-role key; RLS is enabled so browser clients
-- cannot read/write these tables directly.

CREATE TABLE IF NOT EXISTS public.iconfig_gold_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT,
    bcset_id TEXT NOT NULL,
    target_client TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL DEFAULT 'DEPLOYED'
        CHECK (status IN ('DEPLOYED','OVERWRITTEN','FAILED')),
    payload_hash TEXT NOT NULL,
    payload JSONB NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 0,
    value_count INTEGER NOT NULL DEFAULT 0,
    deployed_by TEXT,
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overwrite_of_version INTEGER,
    result JSONB,
    field_diff JSONB,
    CONSTRAINT uq_iconfig_gold_deployment_version
        UNIQUE (project_id, bcset_id, target_client, version)
);

CREATE INDEX IF NOT EXISTS ix_iconfig_gold_deployments_lookup
    ON public.iconfig_gold_deployments(project_id, bcset_id, target_client, version DESC);

CREATE INDEX IF NOT EXISTS ix_iconfig_gold_deployments_hash
    ON public.iconfig_gold_deployments(payload_hash);

ALTER TABLE public.iconfig_gold_deployments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.iconfig_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT,
    user_id TEXT,
    user_email TEXT,
    display_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    entity_name TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_iconfig_audit_log_project_time
    ON public.iconfig_audit_log(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_iconfig_audit_log_time
    ON public.iconfig_audit_log(created_at DESC);

ALTER TABLE public.iconfig_audit_log ENABLE ROW LEVEL SECURITY;

-- Recommended actions to audit from the application:
-- PROJECT_CREATED
-- PROJECT_MODULES_UPDATED
-- PROJECT_DELETED
-- GOLD_DEPLOYMENT_DEPLOYED
-- GOLD_DEPLOYMENT_OVERWRITTEN

COMMENT ON TABLE public.iconfig_gold_deployments IS
'Immutable Gold deployment version history for iConfigPro. Each successful deployment creates a version.';
COMMENT ON TABLE public.iconfig_audit_log IS
'Application audit trail for iConfigPro project and Gold deployment activity.';
