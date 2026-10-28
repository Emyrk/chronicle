UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'ashenwow')
WHERE slug = 'ashenwow';
