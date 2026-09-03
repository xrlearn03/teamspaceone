-- Create one independent database per microservice for local development.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_db') THEN
    CREATE DATABASE identity_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'organisation_db') THEN
    CREATE DATABASE organisation_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'messaging_db') THEN
    CREATE DATABASE messaging_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'realtime_db') THEN
    CREATE DATABASE realtime_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'project_db') THEN
    CREATE DATABASE project_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'file_db') THEN
    CREATE DATABASE file_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'meeting_db') THEN
    CREATE DATABASE meeting_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_db') THEN
    CREATE DATABASE notification_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'search_db') THEN
    CREATE DATABASE search_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ai_db') THEN
    CREATE DATABASE ai_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'audit_db') THEN
    CREATE DATABASE audit_db;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_db') THEN
    CREATE DATABASE notification_db;
  END IF;
END $$;
