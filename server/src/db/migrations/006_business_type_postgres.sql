-- Store type: supermarket (default) or clinic / drug shop (distinct product categories)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'supermarket';

UPDATE businesses
SET business_type = 'supermarket'
WHERE business_type IS NULL OR trim(business_type) = '';

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_business_type_check;

ALTER TABLE businesses
  ADD CONSTRAINT businesses_business_type_check
  CHECK (business_type IN ('supermarket', 'clinic'));
