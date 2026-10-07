ALTER TABLE despachos
  ADD COLUMN IF NOT EXISTS hora_retorno timestamptz,
  ADD COLUMN IF NOT EXISTS retorno_por_usuario_id uuid REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS despachos_retorno_usuario_idx
  ON despachos(retorno_por_usuario_id);
