-- Add permission and scope tables for granular RBAC.
-- This migration is safe to re-run only before data exists; it does not seed permissions.

-- Add columns to roles.
ALTER TABLE "roles" ADD COLUMN "description" TEXT;
ALTER TABLE "roles" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;

-- Create permissions registry.
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_module_resource_action_key" ON "permissions"("module", "resource", "action");

-- Link roles to permissions.
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Many-to-many link between memberships and roles.
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_roles_membershipId_roleId_key" ON "user_roles"("membershipId", "roleId");
CREATE INDEX "user_roles_membershipId_idx" ON "user_roles"("membershipId");
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organisation_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data scopes for a membership (module-level scope control).
CREATE TABLE "data_scopes" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_scopes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_scopes_membershipId_idx" ON "data_scopes"("membershipId");
CREATE INDEX "data_scopes_module_scope_idx" ON "data_scopes"("module", "scope");

ALTER TABLE "data_scopes" ADD CONSTRAINT "data_scopes_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "organisation_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default data scopes per role.
CREATE TABLE "role_scopes" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_scopes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "role_scopes_roleId_idx" ON "role_scopes"("roleId");
CREATE INDEX "role_scopes_module_scope_idx" ON "role_scopes"("module", "scope");

ALTER TABLE "role_scopes" ADD CONSTRAINT "role_scopes_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Audit log for security and sensitive actions.
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_organisationId_idx" ON "audit_logs"("organisationId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
