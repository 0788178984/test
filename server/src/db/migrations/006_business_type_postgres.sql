-- Store type: supermarket (default) or clinic / drug shop (distinct product categories)
-- Applied automatically on server start via server/src/db/schemaPatches.js
-- Run this file manually in Supabase SQL Editor if needed:

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'supermarket';
UPDATE businesses SET business_type = 'supermarket' WHERE business_type IS NULL OR trim(business_type) = '';
ALTER TABLE businesses ALTER COLUMN business_type SET DEFAULT 'supermarket';
ALTER TABLE businesses ALTER COLUMN business_type SET NOT NULL;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_business_type_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_business_type_check CHECK (business_type IN ('supermarket', 'clinic'));
