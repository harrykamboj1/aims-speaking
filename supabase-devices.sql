-- ═══════════════════════════════════════════════════════
-- Device Management Setup
-- ═══════════════════════════════════════════════════════

-- Add max_devices column to users table (default 3 = up to 3 devices)
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_devices INTEGER DEFAULT 3;

-- ─── User Devices Table ───────────────────────────────
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  device_name TEXT,
  browser TEXT,
  os TEXT,
  ip_address TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Each user can only have one entry per fingerprint
  CONSTRAINT unique_user_device UNIQUE (user_id, fingerprint)
);

-- ─── Indexes ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON user_devices(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON user_devices(last_active);
