ALTER TABLE despachos
  ADD COLUMN IF NOT EXISTS hora_llegada timestamptz,
  ADD COLUMN IF NOT EXISTS llegada_por_usuario_id uuid REFERENCES usuarios(id);

ALTER TABLE despachos DROP CONSTRAINT IF EXISTS despachos_estado_check;
ALTER TABLE despachos
  ADD CONSTRAINT despachos_estado_check
  CHECK (estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA', 'ENTREGADO'));

CREATE INDEX IF NOT EXISTS despachos_llegada_usuario_idx
  ON despachos(llegada_por_usuario_id);
