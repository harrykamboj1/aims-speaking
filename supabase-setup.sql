-- ═══════════════════════════════════════════════════════
-- Supabase Database Setup for TCF Canada Speaking Tutor
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Admins Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Users Table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  mobile TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- At least one of email or mobile must be provided
  CONSTRAINT email_or_mobile CHECK (email IS NOT NULL OR mobile IS NOT NULL)
);

-- ─── Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

