-- Dining tables are shared by all staff in a business. Employees can read
-- the list for POS orders; only owners can manage it.
CREATE TABLE dining_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_dining_tables_business_name
  ON dining_tables (business_id, lower(name));
CREATE INDEX idx_dining_tables_business
  ON dining_tables (business_id);

ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business staff can view dining tables" ON dining_tables
  FOR SELECT USING (business_id = auth_business_id());

CREATE POLICY "Owners manage dining tables" ON dining_tables
  FOR ALL USING (business_id = auth_business_id() AND auth_role() = 'OWNER')
  WITH CHECK (business_id = auth_business_id() AND auth_role() = 'OWNER');
