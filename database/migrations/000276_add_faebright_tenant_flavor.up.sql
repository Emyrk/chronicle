-- Add the tenant-specific tag so Faebright gets branded SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'faebright')
WHERE slug = 'faebright'
  AND NOT ('faebright' = ANY(additional_flavor));
