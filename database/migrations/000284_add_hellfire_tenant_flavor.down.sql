UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'hellfire')
WHERE slug = 'hellfire';
