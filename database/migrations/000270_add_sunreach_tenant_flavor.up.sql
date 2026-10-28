-- Add the tenant-specific tag so Sun Reach gets branded homepage SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'sunreach')
WHERE slug = 'sunreach'
  AND NOT ('sunreach' = ANY(additional_flavor));
