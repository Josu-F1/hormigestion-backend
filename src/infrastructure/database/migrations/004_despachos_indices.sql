CREATE UNIQUE INDEX despachos_mixer_activo_unq
  ON despachos(mixer_id)
  WHERE estado IN ('PENDIENTE', 'EN_TRANSITO');

CREATE UNIQUE INDEX despachos_conductor_activo_unq
  ON despachos(conductor_id)
  WHERE estado IN ('PENDIENTE', 'EN_TRANSITO');
