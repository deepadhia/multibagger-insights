-- Single admin table for app login (Express API + UI gate).
-- Passwords are bcrypt hashes (see backend/seed-admin.js).

CREATE TABLE IF NOT EXISTS app_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_admin_users IS 'Admin login for Multibagger Insights backend; not exposed via Supabase anon API.';
