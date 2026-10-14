CREATE TABLE conductores (
  id uuid PRIMARY KEY,
  nombre_completo text NOT NULL,
  cedula text NOT NULL UNIQUE,
  licencia_tipo text NOT NULL,
  telefono text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Datos iniciales (DEMO) para que el frontend pueda probar
INSERT INTO conductores (id, nombre_completo, cedula, licencia_tipo, telefono, activo) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Juan Pérez', '1700000001', 'E', '0990000001', true),
  ('50000000-0000-0000-0000-000000000002', 'Carlos López', '1700000002', 'E', '0990000002', true);

CREATE TABLE despachos (
  id uuid PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT, -- simplificando: se asume que cotización aprobada = pedido
  mixer_id text NOT NULL REFERENCES camiones_mixer(codigo) ON DELETE RESTRICT,
  conductor_id uuid NOT NULL REFERENCES conductores(id) ON DELETE RESTRICT,
  volumen_m3 numeric(8,3) NOT NULL CHECK(volumen_m3 > 0),
  hora_salida timestamptz,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'EN_TRANSITO', 'ENTREGADO')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX despachos_pedido_idx ON despachos(pedido_id);
CREATE INDEX despachos_mixer_idx ON despachos(mixer_id);
CREATE INDEX despachos_estado_idx ON despachos(estado);
