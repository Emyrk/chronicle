UPDATE tenants
SET additional_flavor = array_remove(additional_flavor, 'faebright')
WHERE slug = 'faebright';
