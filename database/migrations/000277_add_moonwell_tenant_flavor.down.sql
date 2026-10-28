UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'moonwell')
WHERE slug = 'moonwell';
