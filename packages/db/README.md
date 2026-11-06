# Database boundary

`src/schema.ts` supplies the typed Drizzle query model. Numbered SQL files in
`migrations/` are the authoritative database definition, including composite
tenant/property foreign keys, CHECK constraints, PostGIS indexes, and the
append-only audit trigger. Do not regenerate SQL over an applied migration.

Run `pnpm db:migrate` from the repository root after configuring `.env`. The
runner holds a PostgreSQL transaction-scoped advisory lock and records each
successful migration in `atlas_migrations`. DDL and its migration marker commit
atomically. Apply corrections through a new numbered file. Production rollback
requires a reviewed forward correction or a tested backup restore; destructive
automatic down-migrations are deliberately absent.

All domain rows carry `organization_id`. Child records additionally enforce
their property/building/floor lineage through composite foreign keys. UUIDs do
not replace request authorization: API services must still check membership,
role, explicit property grants, and the scope of every document download.

`properties.location` is generated from longitude/latitude in WGS84 and indexed
with GiST. It is intentionally not writable through Drizzle. Footprint geometry
is stored as a GeoJSON Polygon; uploaded/document geometry needs application
validation and provenance before it can be treated as verified.

Decimal surface areas, room counts, heights, and geographic coordinates remain
PostgreSQL numeric strings at the persistence boundary. DTO conversion is
explicit. Future money fields must use integer cents or numeric decimals and
must never reuse JavaScript float calculations for financial totals.

`scripts/seed.ts` uses Better Auth's own password hasher and inserts exclusively
synthetic demonstration rows. Re-running the seed does not overwrite manual
changes. Credentials are deliberately public demo credentials and are blocked
from ordinary production seeding. No user portfolio addresses or files belong
in these migrations or fixtures.

Database invariant tests live in `tests/integration/db-invariants.test.ts` and
roll back each isolated fixture. API authorization and upload checks are tested
at their own application boundary.
