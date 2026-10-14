UPDATE conductores
SET usuario_id = NULL
WHERE usuario_id = (
  SELECT id FROM usuarios
  WHERE email = 'conductor@demo.hormigestion.test'
);

UPDATE conductores c
SET usuario_id = u.id
FROM usuarios u
WHERE u.email = 'conductor@demo.hormigestion.test'
  AND c.id = '50000000-0000-0000-0000-000000000002';
