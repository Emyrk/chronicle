-- Add the tenant-specific tag so Moonwell gets branded SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'moonwell')
WHERE slug = 'moonwell'
  AND NOT ('moonwell' = ANY(additional_flavor));
