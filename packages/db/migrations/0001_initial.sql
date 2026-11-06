CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE auth_user (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 email_verified boolean NOT NULL DEFAULT false, image text, two_factor_enabled boolean DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_session (
 id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
 ip_address text, user_agent text, user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_session_user_idx ON auth_session(user_id);
CREATE TABLE auth_account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
 user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
 access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz,
 refresh_token_expires_at timestamptz, scope text, password text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT auth_account_provider_uidx UNIQUE(provider_id,account_id)
);
CREATE INDEX auth_account_user_idx ON auth_account(user_id);
CREATE TABLE auth_verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verification_identifier_idx ON auth_verification(identifier);
CREATE TABLE auth_two_factor (
 id text PRIMARY KEY, secret text NOT NULL, backup_codes text NOT NULL,
 user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_two_factor_user_idx ON auth_two_factor(user_id);

CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
 organization_id uuid NOT NULL REFERENCES organizations(id), user_id text NOT NULL REFERENCES auth_user(id),
 role text NOT NULL CHECK(role IN ('admin','manager','editor','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,user_id)
);
CREATE INDEX membership_user_idx ON memberships(user_id);

CREATE TABLE properties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, name text NOT NULL, street text, house_number text, postal_code text, city text,
 latitude numeric(10,7), longitude numeric(10,7),
 geo_status text NOT NULL DEFAULT 'missing' CHECK(geo_status IN ('demo','verified','unverified','missing')),
 footprint jsonb, management_type text NOT NULL DEFAULT 'rental' CHECK(management_type IN ('rental','weg','mixed')),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')),
 source_system text, source_record_id text, note text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 location geometry(Point,4326) GENERATED ALWAYS AS (
  CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint(longitude::double precision,latitude::double precision),4326) ELSE NULL END
 ) STORED,
 CONSTRAINT properties_code_uidx UNIQUE(organization_id,code),
 CONSTRAINT properties_org_id_uidx UNIQUE(organization_id,id),
 CONSTRAINT properties_source_uidx UNIQUE(organization_id,source_system,source_record_id),
 CONSTRAINT property_coordinates_check CHECK((latitude IS NULL)=(longitude IS NULL) AND (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)),
 CONSTRAINT property_verified_coordinates_check CHECK(geo_status NOT IN ('verified','demo') OR latitude IS NOT NULL),
 CONSTRAINT property_missing_coordinates_check CHECK(geo_status<>'missing' OR latitude IS NULL),
 CONSTRAINT property_footprint_check CHECK(footprint IS NULL OR (jsonb_typeof(footprint)='object' AND footprint->>'type'='Polygon' AND jsonb_typeof(footprint->'coordinates')='array'))
);
CREATE INDEX properties_org_idx ON properties(organization_id);
CREATE INDEX properties_location_gist ON properties USING GIST(location);
CREATE TABLE property_grants (
 organization_id uuid NOT NULL REFERENCES organizations(id), property_id uuid NOT NULL REFERENCES properties(id),
 user_id text NOT NULL REFERENCES auth_user(id), can_edit boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,property_id,user_id),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX property_grant_user_idx ON property_grants(user_id);
CREATE TABLE buildings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), name text NOT NULL, height_m numeric(9,3) CHECK(height_m IS NULL OR height_m>0),
 footprint jsonb, model_asset_key text, source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT buildings_scope_uidx UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id)
);
CREATE INDEX buildings_property_idx ON buildings(organization_id,property_id);
CREATE TABLE entrances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), building_id uuid NOT NULL REFERENCES buildings(id), name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT entrances_scope_uidx UNIQUE(organization_id,property_id,building_id,id),
 FOREIGN KEY(organization_id,property_id,building_id) REFERENCES buildings(organization_id,property_id,id)
);
CREATE TABLE floors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), building_id uuid NOT NULL REFERENCES buildings(id),
 entrance_id uuid REFERENCES entrances(id), name text NOT NULL, level integer NOT NULL CHECK(level BETWEEN -10 AND 150),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT floors_scope_uidx UNIQUE(organization_id,property_id,building_id,id),
 FOREIGN KEY(organization_id,property_id,building_id) REFERENCES buildings(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,building_id,entrance_id) REFERENCES entrances(organization_id,property_id,building_id,id)
);
CREATE INDEX floors_building_idx ON floors(organization_id,building_id);
CREATE TABLE units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), building_id uuid NOT NULL REFERENCES buildings(id), floor_id uuid NOT NULL REFERENCES floors(id),
 code text NOT NULL, label text NOT NULL, usage text NOT NULL DEFAULT 'residential' CHECK(usage IN ('residential','commercial','parking')),
 status text NOT NULL DEFAULT 'vacant' CHECK(status IN ('occupied','vacant','owner_occupied','unavailable')),
 area_m2 numeric(12,2) CHECK(area_m2 IS NULL OR area_m2>0), rooms numeric(5,1) CHECK(rooms IS NULL OR (rooms>0 AND rooms<=100)),
 note text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')), archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT units_code_uidx UNIQUE(organization_id,property_id,code),
 CONSTRAINT units_scope_uidx UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id,building_id,floor_id) REFERENCES floors(organization_id,property_id,building_id,id)
);
CREATE INDEX units_floor_idx ON units(organization_id,floor_id);
CREATE INDEX units_property_idx ON units(organization_id,property_id);
CREATE TABLE parties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 kind text NOT NULL DEFAULT 'person' CHECK(kind IN ('person','organization')),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT parties_scope_uidx UNIQUE(organization_id,id)
);
CREATE TABLE unit_parties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), unit_id uuid NOT NULL REFERENCES units(id), party_id uuid NOT NULL REFERENCES parties(id),
 role text NOT NULL CHECK(role IN ('tenant','co_tenant','owner','representative')), valid_from date NOT NULL, valid_to date,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id,unit_id) REFERENCES units(organization_id,property_id,id),
 FOREIGN KEY(organization_id,party_id) REFERENCES parties(organization_id,id),
 CONSTRAINT unit_parties_dates_check CHECK(valid_to IS NULL OR valid_to>=valid_from)
);
CREATE INDEX unit_parties_unit_idx ON unit_parties(organization_id,unit_id);
CREATE TABLE documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), unit_id uuid REFERENCES units(id), title text NOT NULL,
 original_name text NOT NULL, mime_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=15728640),
 kind text NOT NULL DEFAULT 'document' CHECK(kind IN ('floorplan','document')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 source text NOT NULL DEFAULT 'manual' CHECK(source IN ('demo','manual','import')), created_by text NOT NULL REFERENCES auth_user(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT documents_scope_uidx UNIQUE(organization_id,property_id,id),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 FOREIGN KEY(organization_id,property_id,unit_id) REFERENCES units(organization_id,property_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX documents_property_idx ON documents(organization_id,property_id);
CREATE INDEX documents_unit_idx ON documents(organization_id,unit_id);
CREATE TABLE document_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), document_id uuid NOT NULL REFERENCES documents(id),
 version integer NOT NULL CHECK(version>0), storage_key text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), mime_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=15728640),
 original_name text NOT NULL, created_by text NOT NULL REFERENCES auth_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT document_versions_number_uidx UNIQUE(document_id,version),
 FOREIGN KEY(organization_id,property_id,document_id) REFERENCES documents(organization_id,property_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id)
);
CREATE TABLE tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id), unit_id uuid REFERENCES units(id), title text NOT NULL,
 description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')), due_date date,
 assigned_to text REFERENCES auth_user(id), created_by text NOT NULL REFERENCES auth_user(id), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 FOREIGN KEY(organization_id,property_id,unit_id) REFERENCES units(organization_id,property_id,id),
 FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,assigned_to) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX tasks_property_idx ON tasks(organization_id,property_id);
CREATE INDEX tasks_due_idx ON tasks(organization_id,status,due_date);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid REFERENCES properties(id), actor_id text NOT NULL REFERENCES auth_user(id),
 action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, before jsonb, after jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES memberships(organization_id,user_id)
);
CREATE INDEX audit_entity_idx ON audit_events(organization_id,entity_type,entity_id,created_at);
CREATE INDEX audit_property_idx ON audit_events(organization_id,property_id);
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE bootstrap_meta (key text PRIMARY KEY, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE request_rate_limits (key text NOT NULL, window_start bigint NOT NULL, count integer NOT NULL DEFAULT 0 CHECK(count>=0), PRIMARY KEY(key,window_start));
