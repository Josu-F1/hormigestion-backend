ALTER TABLE conductores
  ADD COLUMN usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX conductores_usuario_idx
  ON conductores(usuario_id)
  WHERE usuario_id IS NOT NULL;

UPDATE conductores c
SET usuario_id = u.id
FROM usuarios u
WHERE u.email = 'conductor@demo.hormigestion.test'
  AND c.id = '50000000-0000-0000-0000-000000000001'
  AND c.usuario_id IS NULL;

ALTER TABLE despachos
  ADD COLUMN iniciado_por_usuario_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  ADD COLUMN iniciado_en timestamptz;

CREATE INDEX despachos_conductor_estado_idx
  ON despachos(conductor_id, estado);
