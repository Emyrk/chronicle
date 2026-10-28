-- Add the tenant-specific tag so AshenWoW gets branded SEO copy.
-- This targets at most one row because tenant slugs are unique.
UPDATE tenants
SET additional_flavor = array_append(additional_flavor, 'ashenwow')
WHERE slug = 'ashenwow'
  AND NOT ('ashenwow' = ANY(additional_flavor));
