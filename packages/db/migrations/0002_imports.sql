CREATE TABLE import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_by text NOT NULL REFERENCES auth_user(id),
  source_system text NOT NULL CHECK (source_system ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  data_class text NOT NULL CHECK (data_class IN ('synthetic','real')),
  format text NOT NULL CHECK (format IN ('csv','json','screenshot')),
  original_name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review','imported')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  imported_at timestamptz,
  imported_by text REFERENCES auth_user(id),
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_batches_scope_uidx UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,created_by) REFERENCES memberships(organization_id,user_id),
  FOREIGN KEY (organization_id,imported_by) REFERENCES memberships(organization_id,user_id),
  CONSTRAINT import_batches_commit_check CHECK (
    (status='review' AND imported_at IS NULL AND imported_by IS NULL)
    OR (status='imported' AND imported_at IS NOT NULL AND imported_by IS NOT NULL)
  )
);
CREATE INDEX import_batches_org_idx ON import_batches(organization_id,created_at);

CREATE TABLE import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  batch_id uuid NOT NULL REFERENCES import_batches(id),
  source_line integer NOT NULL CHECK (source_line > 0),
  source_record_id text NOT NULL,
  raw_data jsonb NOT NULL,
  data jsonb NOT NULL,
  source_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  included boolean NOT NULL DEFAULT true,
  confirmed boolean NOT NULL DEFAULT false,
  property_id uuid REFERENCES properties(id),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_records_line_uidx UNIQUE(batch_id,source_line),
  FOREIGN KEY(organization_id,batch_id) REFERENCES import_batches(organization_id,id),
  FOREIGN KEY(organization_id,property_id) REFERENCES properties(organization_id,id),
  CONSTRAINT import_records_json_check CHECK (
    jsonb_typeof(raw_data)='object' AND jsonb_typeof(data)='object' AND jsonb_typeof(source_issues)='array'
  )
);
CREATE INDEX import_records_batch_idx ON import_records(organization_id,batch_id);

-- A committed batch is source evidence. Subsequent changes need a new revision/batch.
CREATE FUNCTION atlas_guard_committed_import() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='import_batches' THEN
    IF OLD.status='imported' THEN RAISE EXCEPTION 'Committed import batches are immutable'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM import_batches WHERE id=(CASE WHEN TG_OP='INSERT' THEN NEW.batch_id ELSE OLD.batch_id END) AND status='imported') THEN
      RAISE EXCEPTION 'Committed import records are immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER import_batches_immutable BEFORE UPDATE OR DELETE ON import_batches
  FOR EACH ROW EXECUTE FUNCTION atlas_guard_committed_import();
CREATE TRIGGER import_records_immutable BEFORE INSERT OR UPDATE OR DELETE ON import_records
  FOR EACH ROW EXECUTE FUNCTION atlas_guard_committed_import();
