UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'sunreach')
WHERE slug = 'sunreach';
