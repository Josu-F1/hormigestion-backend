CREATE TABLE roles (
  codigo text PRIMARY KEY CHECK (codigo IN ('ADMINISTRADOR','DESPACHADOR','LABORATORISTA','CONDUCTOR')),
  nombre text NOT NULL
);
INSERT INTO roles(codigo,nombre) VALUES ('ADMINISTRADOR','Administrador'),('DESPACHADOR','Despachador'),('LABORATORISTA','Laboratorista'),('CONDUCTOR','Conductor');

CREATE TABLE usuarios (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE CHECK (email = lower(email)),
  nombre text NOT NULL, password_hash text NOT NULL, rol_codigo text NOT NULL REFERENCES roles(codigo),
  activo boolean NOT NULL DEFAULT true, datos_demostracion boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usuarios_rol_idx ON usuarios(rol_codigo);

CREATE TABLE configuracion_versiones (
  version integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contenido jsonb NOT NULL CHECK (jsonb_typeof(contenido) = 'object'),
  motivo text NOT NULL, autor_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE configuracion_actual (
  id smallint PRIMARY KEY CHECK (id = 1), version integer NOT NULL REFERENCES configuracion_versiones(version)
);

CREATE TABLE resistencias (
  codigo text PRIMARY KEY, fc_kgf_cm2 integer NOT NULL CHECK(fc_kgf_cm2 > 0),
  precio_m3 numeric(10,2) NOT NULL CHECK(precio_m3 > 0),
  slump_objetivo_mm numeric(7,3) NOT NULL CHECK(slump_objetivo_mm >= 0),
  agregado_max_mm numeric(7,3) NOT NULL CHECK(agregado_max_mm > 0),
  descripcion text NOT NULL, activo boolean NOT NULL, version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);
CREATE TABLE elementos_constructivos (
  codigo text PRIMARY KEY, nombre text NOT NULL, desperdicio_sugerido_pct numeric(6,3) NOT NULL CHECK(desperdicio_sugerido_pct BETWEEN 0 AND 30),
  geometria text NOT NULL CHECK(geometria IN ('PRISMA','CILINDRO','VOLUMEN_DIRECTO')), activo boolean NOT NULL,
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);
CREATE TABLE zonas_flete (
  codigo text PRIMARY KEY, canton text NOT NULL, sector text NOT NULL, distancia_km numeric(9,3) NOT NULL CHECK(distancia_km >= 0),
  traslado_estimado_min integer NOT NULL CHECK(traslado_estimado_min > 0), tarifa_flete_m3 numeric(10,2) NOT NULL CHECK(tarifa_flete_m3 >= 0),
  activo boolean NOT NULL, version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);
CREATE TABLE camiones_mixer (
  codigo text PRIMARY KEY, placa text NOT NULL UNIQUE, marca_modelo text NOT NULL, capacidad_m3 numeric(8,3) NOT NULL CHECK(capacidad_m3 > 0),
  estado text NOT NULL CHECK(estado IN ('DISPONIBLE','MANTENIMIENTO','INACTIVO')),
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);

CREATE TABLE clientes (
  id uuid PRIMARY KEY, nombre text NOT NULL, telefono text NOT NULL, email text,
  datos_demostracion boolean NOT NULL, creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cotizaciones (
  id uuid PRIMARY KEY, codigo text NOT NULL UNIQUE, cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  zona_codigo text NOT NULL REFERENCES zonas_flete(codigo), version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','CONTACTADA','APROBADA','RECHAZADA','VENCIDA')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0), datos_demostracion boolean NOT NULL,
  volumen_total_m3 numeric(14,6) NOT NULL CHECK(volumen_total_m3 > 0),
  total numeric(14,2) NOT NULL CHECK(total >= 0), snapshot jsonb NOT NULL,
  idempotency_hash text NOT NULL UNIQUE, solicitud_hash text NOT NULL, token_acceso_hash text NOT NULL,
  valida_hasta timestamptz NOT NULL, acceso_expira_en timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(valida_hasta > creado_en), CHECK(acceso_expira_en > creado_en)
);
CREATE INDEX cotizaciones_estado_fecha_idx ON cotizaciones(estado,creado_en DESC);
CREATE INDEX cotizaciones_cliente_idx ON cotizaciones(cliente_id);
CREATE INDEX cotizaciones_zona_idx ON cotizaciones(zona_codigo);
CREATE INDEX cotizaciones_configuracion_idx ON cotizaciones(version_configuracion);
CREATE TABLE detalles_cotizacion (
  id uuid PRIMARY KEY, cotizacion_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT,
  posicion integer NOT NULL CHECK(posicion >= 0), elemento_codigo text NOT NULL REFERENCES elementos_constructivos(codigo),
  resistencia_codigo text NOT NULL REFERENCES resistencias(codigo), cantidad integer NOT NULL CHECK(cantidad > 0),
  volumen_neto_m3 numeric(14,6) NOT NULL CHECK(volumen_neto_m3 > 0), volumen_total_m3 numeric(14,6) NOT NULL CHECK(volumen_total_m3 > 0),
  desperdicio_pct numeric(6,3) NOT NULL CHECK(desperdicio_pct BETWEEN 0 AND 30), precio_unitario_m3 numeric(10,2) NOT NULL CHECK(precio_unitario_m3 > 0),
  subtotal_hormigon numeric(14,2) NOT NULL CHECK(subtotal_hormigon >= 0), snapshot jsonb NOT NULL,
  UNIQUE(cotizacion_id,posicion)
);
CREATE INDEX detalles_cotizacion_elemento_idx ON detalles_cotizacion(elemento_codigo);
CREATE INDEX detalles_cotizacion_resistencia_idx ON detalles_cotizacion(resistencia_codigo);

CREATE TABLE auditoria_eventos (
  id uuid PRIMARY KEY, autor_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  accion text NOT NULL, recurso_id text NOT NULL, datos jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_recurso_idx ON auditoria_eventos(recurso_id,creado_en DESC);
CREATE INDEX auditoria_autor_idx ON auditoria_eventos(autor_id);
CREATE TABLE eventos_salida (
  id uuid PRIMARY KEY, tipo text NOT NULL, recurso_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT,
  deduplicacion text NOT NULL UNIQUE, payload jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','ENTREGADO','FALLIDO')),
  intentos integer NOT NULL DEFAULT 0 CHECK(intentos >= 0), creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_salida_pendientes_idx ON eventos_salida(creado_en) WHERE estado = 'PENDIENTE';
CREATE INDEX eventos_salida_recurso_idx ON eventos_salida(recurso_id);
