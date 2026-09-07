-- Create one independent database per microservice for local development.
-- CREATE DATABASE cannot run inside a PL/pgSQL function, so we use dblink
-- to execute each CREATE DATABASE in a separate connection.
CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE identity_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'organisation_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE organisation_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'messaging_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE messaging_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'realtime_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE realtime_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'project_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE project_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'file_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE file_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'meeting_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE meeting_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE notification_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'search_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE search_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE ai_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'audit_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE audit_db');
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hrms_db') THEN
    PERFORM dblink_exec('dbname=' || current_database() || '', 'CREATE DATABASE hrms_db');
  END IF;
END $$;
