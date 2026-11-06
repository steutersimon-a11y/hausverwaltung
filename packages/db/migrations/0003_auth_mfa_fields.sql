-- Better Auth's installed two-factor plugin includes these optional lockout fields.
ALTER TABLE auth_two_factor ADD COLUMN IF NOT EXISTS verified boolean DEFAULT true;
ALTER TABLE auth_two_factor ADD COLUMN IF NOT EXISTS failed_verification_count integer DEFAULT 0;
ALTER TABLE auth_two_factor ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS auth_two_factor_secret_idx ON auth_two_factor(secret);
