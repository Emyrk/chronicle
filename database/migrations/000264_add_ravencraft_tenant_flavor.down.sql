UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'ravencraft')
WHERE slug = 'ravencraft';
