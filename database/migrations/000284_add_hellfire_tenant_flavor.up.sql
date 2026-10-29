-- Add the tenant-specific tag so Hellfire WoW gets branded SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'hellfire')
WHERE slug = 'hellfire'
  AND NOT ('hellfire' = ANY(additional_flavor));
