-- Add the tenant-specific tag so Ravencraft gets branded homepage SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'ravencraft')
WHERE slug = 'ravencraft'
  AND NOT ('ravencraft' = ANY(additional_flavor));
