-- =============================================================================
-- SISTEMA HORMIGESTIÓN - MIGRACIÓN BASE CONSOLIDADA
-- Estructura de Tablas, Índices, Restricciones y Datos Iniciales Maestros
-- =============================================================================

-- 1. ROLES Y USUARIOS DEL SISTEMA
CREATE TABLE roles (
  codigo text PRIMARY KEY CHECK (codigo IN ('ADMINISTRADOR','DESPACHADOR','LABORATORISTA','CONDUCTOR')),
  nombre text NOT NULL
);

INSERT INTO roles(codigo, nombre) VALUES
  ('ADMINISTRADOR', 'Administrador'),
  ('DESPACHADOR', 'Despachador'),
  ('LABORATORISTA', 'Laboratorista'),
  ('CONDUCTOR', 'Conductor');

CREATE TABLE usuarios (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  nombre text NOT NULL,
  password_hash text NOT NULL,
  rol_codigo text NOT NULL REFERENCES roles(codigo),
  activo boolean NOT NULL DEFAULT true,
  datos_demostracion boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usuarios_rol_idx ON usuarios(rol_codigo);

-- Inserción de usuarios del sistema
INSERT INTO usuarios (id, email, nombre, password_hash, rol_codigo, activo, datos_demostracion, creado_en, actualizado_en) VALUES
  ('d7378089-c586-4b69-be5c-21fb8e6b0bcc', 'admin@demo.hormigestion.test', 'Hormigonera Ltda', '$2b$12$IHsunTgmpQH6Vg07u/QgH.ym0.oBSKXEomDCg9EoBxxWXm2b.nX/6', 'ADMINISTRADOR', true, false, '2026-10-05T12:23:48.389Z', '2026-10-05T12:23:48.389Z'),
  ('6cac4e1e-d27e-4afc-b9ce-139c43fd1331', 'calidad@demo.hormigestion.test', 'Laboratorista DEMO', '$2b$12$IHsunTgmpQH6Vg07u/QgH.ym0.oBSKXEomDCg9EoBxxWXm2b.nX/6', 'LABORATORISTA', true, true, '2026-10-05T12:23:48.389Z', '2026-10-05T12:23:48.389Z'),
  ('13f34a5d-974c-4cff-b4d0-618730f54a0e', 'despacho@demo.hormigestion.test', 'Despachador DEMO', '$2b$12$IHsunTgmpQH6Vg07u/QgH.ym0.oBSKXEomDCg9EoBxxWXm2b.nX/6', 'DESPACHADOR', true, true, '2026-10-05T12:23:48.389Z', '2026-10-05T12:23:48.389Z'),
  ('53f5eb05-0d81-438c-b355-b4faa08ee33a', 'francis323@gmail.com', 'Francisco Cabrera', '$2b$12$rK9nKUH5skuxLKM8y4TtO.WNLxgZ.fAfcyb3pfKJovY0mLzBkSblu', 'CONDUCTOR', true, true, '2026-10-05T12:23:48.389Z', '2026-10-16T07:15:18.000Z'),
  ('50d4b9fa-c154-4a5d-92e8-95e830c2cf1e', 'santiago2003@outlook.es', 'Segundo Morales', '$2b$12$SncOOna0ZfjsbJdv.e2zHu.Fxq4djLy7ubJqyQMWX.Gw/PTQbYZL.', 'CONDUCTOR', true, false, '2026-10-16T06:40:17.653Z', '2026-10-16T07:15:00.944Z'),
  ('35dabd47-73cb-420a-834a-96d1695f5af9', 'santichan43@gmail.com', 'Santiago Chango', '$2b$12$o5stewd4rfrV/D2YzJOAhOpxQVnEXi68unpeY8QtB1GEUJHKyMeoW', 'CONDUCTOR', true, false, '2026-10-16T06:41:25.793Z', '2026-10-16T06:41:25.793Z');

-- 2. CONFIGURACIÓN Y VERSIONES DE CATÁLOGO
CREATE TABLE configuracion_versiones (
  version integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contenido jsonb NOT NULL CHECK (jsonb_typeof(contenido) = 'object'),
  motivo text NOT NULL,
  autor_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE configuracion_actual (
  id smallint PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL REFERENCES configuracion_versiones(version)
);

-- Inserción de la configuración maestra
INSERT INTO configuracion_versiones (contenido, motivo, autor_id, creado_en)
VALUES (
  ${"mixers":[{"placa":"TBA-4120","codigo":"HT-MIX-01","estado":"DISPONIBLE","capacidadM3":"8","marcaModelo":"Hino 700 / Mixer McNeilus 8m³"},{"placa":"TBH-6315","codigo":"HT-MIX-02","estado":"DISPONIBLE","capacidadM3":"8","marcaModelo":"Mack Granite / Mixer Schwing Stetter 8m³"},{"placa":"TBC-8942","codigo":"HT-MIX-03","estado":"DISPONIBLE","capacidadM3":"8","marcaModelo":"Mercedes-Benz Actros / Mixer Cifa 8m³"},{"placa":"TBJ-1209","codigo":"HT-MIX-04","estado":"DISPONIBLE","capacidadM3":"8","marcaModelo":"International WorkStar / Mixer Putzmeister 8m³"},{"placa":"TGH-8531","codigo":"HT-MIX-05","estado":"DISPONIBLE","capacidadM3":"8","marcaModelo":"Mixer Mack Granite 2024"}],"planta":{"canton":"Pelileo","cierre":"18:00","nombre":"Hormigonera Tungurahua - Planta Central Salasaca","apertura":"06:30","provincia":"Tungurahua","zonaHoraria":"America/Guayaquil","diasLaborables":[1,2,3,4,5,6],"capacidadProduccionM3Hora":"60"},"calidad":{"avisoMin":60,"criticoMin":80,"slumpMaxMm":"125","slumpMinMm":"75","temperaturaMaxC":"32","edadesEnsayoDias":[7,28],"limiteEntregaMin":90,"referenciaNormativa":"NTE INEN 1855-1 / ASTM C94 / NEC-SE-HM","referenciaVerificada":true},"comercial":{"flete":{"modelo":"POR_ZONA_M3","radioIncluidoKm":"10","tarifaKmPorViaje":"2.5"},"bombeo":{"tarifaM3":"12","habilitado":true,"cargoMinimo":"120"},"ivaPct":"15","moneda":"USD","condiciones":"Condiciones Generales de Suministro: Precios en USD. Fecha y hora de colado sujetas a confirmación logística con despacho en planta Salasaca. La descarga incluye 45 minutos de espera por camión mixer; tiempo adicional se factura a $25/hora. El cliente debe garantizar acceso vial despejado y firme para vehículos de carga pesada de 28 toneladas. El volumen entregado se certifica mediante guía de remisión oficial y medición en estado fresco.","vigenciaDias":7,"tarifaEsperaHora":"25","desperdicioMaxPct":"20","desperdicioMinPct":"0","esperaIncluidaMin":45,"incrementoVolumenM3":"0.1","diasAccesoComprobante":30,"anticipacionPedidoHoras":24,"modificacionesAnticipacionHoras":24},"elementos":[{"activo":true,"codigo":"LOSA-MACIZA","nombre":"Losa maciza","geometria":"PRISMA","desperdicioSugeridoPct":"5"},{"activo":true,"codigo":"LOSA-ALIVIANADA","nombre":"Losa alivianada con bloques/nervios","geometria":"VOLUMEN_DIRECTO","desperdicioSugeridoPct":"7"},{"activo":true,"codigo":"ZAPATA","nombre":"Zapata o plinto de cimentación","geometria":"PRISMA","desperdicioSugeridoPct":"5"},{"activo":true,"codigo":"COLUMNA-RECTANGULAR","nombre":"Columna rectangular","geometria":"PRISMA","desperdicioSugeridoPct":"5"},{"activo":true,"codigo":"COLUMNA-CIRCULAR","nombre":"Columna circular","geometria":"CILINDRO","desperdicioSugeridoPct":"5"},{"activo":true,"codigo":"MURO-CONTENCION","nombre":"Muro de contención o pantalla","geometria":"PRISMA","desperdicioSugeridoPct":"6"},{"activo":true,"codigo":"VIGA-AEREA","nombre":"Viga de carga o peraltada","geometria":"PRISMA","desperdicioSugeridoPct":"5"},{"activo":true,"codigo":"VOLUMEN-DIRECTO","nombre":"Volumen neto conocido","geometria":"VOLUMEN_DIRECTO","desperdicioSugeridoPct":"5"}],"logistica":{"cargaMin":15,"lavadoMin":15,"retornoMin":30,"descargaMin":30,"capacidadReferenciaViajeM3":"8"},"zonasFlete":[{"activo":true,"canton":"Pelileo","codigo":"PELILEO-CENTRO","sector":"Pelileo Centro y Matriz","distanciaKm":"4","tarifaFleteM3":"6","trasladoEstimadoMin":12},{"activo":true,"canton":"Pelileo","codigo":"SALASACA","sector":"Salasaca (Vía Principal y Comunidades)","distanciaKm":"2","tarifaFleteM3":"5","trasladoEstimadoMin":8},{"activo":true,"canton":"Pelileo","codigo":"PELILEO-GARCIA-MORENO","sector":"García Moreno y Huambaló","distanciaKm":"8","tarifaFleteM3":"7.5","trasladoEstimadoMin":20},{"activo":true,"canton":"Ambato","codigo":"AMBATO-SUR","sector":"Ambato Sur (Huachi Chico / Huachi Grande / Totoras)","distanciaKm":"14","tarifaFleteM3":"8.5","trasladoEstimadoMin":25},{"activo":true,"canton":"Ambato","codigo":"AMBATO-CENTRO-NORTE","sector":"Ambato Centro y Norte (Ficoa / Miraflores / Atocha / Izamba)","distanciaKm":"18","tarifaFleteM3":"10","trasladoEstimadoMin":35},{"activo":true,"canton":"Cevallos","codigo":"CEVALLOS","sector":"Cevallos Centro y Alrededores","distanciaKm":"11","tarifaFleteM3":"7.5","trasladoEstimadoMin":20},{"activo":true,"canton":"Baños","codigo":"BANOS","sector":"Baños de Agua Santa (Casco Urbano)","distanciaKm":"24","tarifaFleteM3":"14","trasladoEstimadoMin":40},{"activo":true,"canton":"Patate","codigo":"PATATE","sector":"Patate y Valle de los Cristos","distanciaKm":"15","tarifaFleteM3":"9","trasladoEstimadoMin":28},{"activo":true,"canton":"Tisaleo","codigo":"TISALEO","sector":"Tisaleo Centro y Vía Alobamba","distanciaKm":"17","tarifaFleteM3":"9.5","trasladoEstimadoMin":30}],"resistencias":[{"activo":true,"codigo":"FC-180","imagen":"/images/catalogo/fc-180.jpg","fcKgfCm2":180,"precioM3":"72","bombeable":true,"normativa":"NTE INEN 1855-1 / ASTM C94","descripcion":"Hormigón prediseñado para obras complementarias, replantillos, aceras y bordillos con alta docilidad para colocación manual.","agregadoMaxMm":"19","nombreComercial":"Hormigón Estructural Liviano - Clase 180","slumpObjetivoMm":"100","edadGarantiaDias":28,"usosRecomendados":"Aceras peatonales, bordillos, contrapisos residenciales, cadenas de amarre de cerramiento y replantillos.","tiempoManejabilidadMin":90},{"activo":true,"codigo":"FC-210","imagen":"/images/catalogo/fc-210.jpg","fcKgfCm2":210,"precioM3":"78","bombeable":true,"normativa":"NTE INEN 1855-1 / NEC-SE-HM","descripcion":"El hormigón estructural estándar de mayor demanda en Tungurahua para losas, plintos, vigas y columnas residenciales.","agregadoMaxMm":"19","nombreComercial":"Hormigón Estructural Estándar - Clase 210","slumpObjetivoMm":"100","edadGarantiaDias":28,"usosRecomendados":"Losas macizas y alivianadas, vigas de entrepiso, columnas de viviendas de 1 a 2 plantas y plintos.","tiempoManejabilidadMin":90},{"activo":true,"codigo":"FC-240","imagen":"/images/catalogo/fc-240.jpg","fcKgfCm2":240,"precioM3":"84","bombeable":true,"normativa":"NTE INEN 1855-1 / NEC-SE-HM","descripcion":"Fórmula de alta cohesión diseñada para estructuras sismorresistentes de mediana altura (2 a 4 niveles) y armaduras densas.","agregadoMaxMm":"19","nombreComercial":"Hormigón Alta Cohesión - Clase 240","slumpObjetivoMm":"100","edadGarantiaDias":28,"usosRecomendados":"Edificaciones de 2 a 4 pisos, vigas peraltadas, muros de contención de media altura y losas nervadas.","tiempoManejabilidadMin":90},{"activo":true,"codigo":"FC-280","imagen":"/images/catalogo/fc-280.jpg","fcKgfCm2":280,"precioM3":"91","bombeable":true,"normativa":"NTE INEN 1855-1 / ASTM C94","descripcion":"Mezcla de alta resistencia y reducida permeabilidad para muros de contención, cisternas y estructuras sometidas a esfuerzos exigentes.","agregadoMaxMm":"19","nombreComercial":"Hormigón Alta Resistencia - Clase 280","slumpObjetivoMm":"100","edadGarantiaDias":28,"usosRecomendados":"Cisternas de agua, tanques elevados, muros de contención de taludes, zapatas masivas y parqueaderos pesados.","tiempoManejabilidadMin":90},{"activo":true,"codigo":"FC-350","imagen":"/images/catalogo/fc-350.jpg","fcKgfCm2":350,"precioM3":"105","bombeable":true,"normativa":"NTE INEN 1855-1 / ASTM C39","descripcion":"Hormigón de alto desempeño para pavimentos rígidos industriales, puentes, losas de tránsito pesado y elementos prefabricados.","agregadoMaxMm":"12.5","nombreComercial":"Hormigón Especial Alta Carga - Clase 350","slumpObjetivoMm":"115","edadGarantiaDias":28,"usosRecomendados":"Pavimentos industriales, rampas de carga pesada, puentes vehiculares, columnas de alta carga y prefabricados.","tiempoManejabilidadMin":90}],"datosDemostracion":false}$::jsonb,
  'Configuración inicial técnica y comercial - Hormigonera Tungurahua (Salasaca)',
  'd7378089-c586-4b69-be5c-21fb8e6b0bcc',
  now()
);

INSERT INTO configuracion_actual (id, version) VALUES (1, 1);

-- 3. CATÁLOGO TÉCNICO Y COMERCIAL
CREATE TABLE resistencias (
  codigo text PRIMARY KEY,
  fc_kgf_cm2 integer NOT NULL CHECK(fc_kgf_cm2 > 0),
  precio_m3 numeric(10,2) NOT NULL CHECK(precio_m3 > 0),
  slump_objetivo_mm numeric(7,3) NOT NULL CHECK(slump_objetivo_mm >= 0),
  agregado_max_mm numeric(7,3) NOT NULL CHECK(agregado_max_mm > 0),
  descripcion text NOT NULL,
  activo boolean NOT NULL,
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version),
  nombre_comercial text,
  usos_recomendados text,
  tiempo_manejabilidad_min integer,
  bombeable boolean DEFAULT true,
  edad_garantia_dias integer DEFAULT 28,
  normativa text,
  imagen text
);

INSERT INTO resistencias (codigo, fc_kgf_cm2, precio_m3, slump_objetivo_mm, agregado_max_mm, descripcion, activo, version_configuracion, nombre_comercial, usos_recomendados, tiempo_manejabilidad_min, bombeable, edad_garantia_dias, normativa, imagen) VALUES
  ('FC-180', 180, 72.00, 100.000, 19.000, 'Hormigón prediseñado para obras complementarias, replantillos, aceras y bordillos con alta docilidad para colocación manual.', true, 1, 'Hormigón Estructural Liviano - Clase 180', 'Aceras peatonales, bordillos, contrapisos residenciales, cadenas de amarre de cerramiento y replantillos.', 90, true, 28, 'NTE INEN 1855-1 / ASTM C94', '/images/catalogo/fc-180.jpg'),
  ('FC-210', 210, 78.00, 100.000, 19.000, 'El hormigón estructural estándar de mayor demanda en Tungurahua para losas, plintos, vigas y columnas residenciales.', true, 1, 'Hormigón Estructural Estándar - Clase 210', 'Losas macizas y alivianadas, vigas de entrepiso, columnas de viviendas de 1 a 2 plantas y plintos.', 90, true, 28, 'NTE INEN 1855-1 / NEC-SE-HM', '/images/catalogo/fc-210.jpg'),
  ('FC-240', 240, 84.00, 100.000, 19.000, 'Fórmula de alta cohesión diseñada para estructuras sismorresistentes de mediana altura (2 a 4 niveles) y armaduras densas.', true, 1, 'Hormigón Alta Cohesión - Clase 240', 'Edificaciones de 2 a 4 pisos, vigas peraltadas, muros de contención de media altura y losas nervadas.', 90, true, 28, 'NTE INEN 1855-1 / NEC-SE-HM', '/images/catalogo/fc-240.jpg'),
  ('FC-280', 280, 91.00, 100.000, 19.000, 'Mezcla de alta resistencia y reducida permeabilidad para muros de contención, cisternas y estructuras sometidas a esfuerzos exigentes.', true, 1, 'Hormigón Alta Resistencia - Clase 280', 'Cisternas de agua, tanques elevados, muros de contención de taludes, zapatas masivas y parqueaderos pesados.', 90, true, 28, 'NTE INEN 1855-1 / ASTM C94', '/images/catalogo/fc-280.jpg'),
  ('FC-350', 350, 105.00, 115.000, 12.500, 'Hormigón de alto desempeño para pavimentos rígidos industriales, puentes, losas de tránsito pesado y elementos prefabricados.', true, 1, 'Hormigón Especial Alta Carga - Clase 350', 'Pavimentos industriales, rampas de carga pesada, puentes vehiculares, columnas de alta carga y prefabricados.', 90, true, 28, 'NTE INEN 1855-1 / ASTM C39', '/images/catalogo/fc-350.jpg');

CREATE TABLE elementos_constructivos (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  desperdicio_sugerido_pct numeric(6,3) NOT NULL CHECK(desperdicio_sugerido_pct BETWEEN 0 AND 30),
  geometria text NOT NULL CHECK(geometria IN ('PRISMA','CILINDRO','VOLUMEN_DIRECTO')),
  activo boolean NOT NULL,
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);

INSERT INTO elementos_constructivos (codigo, nombre, desperdicio_sugerido_pct, geometria, activo, version_configuracion) VALUES
  ('COLUMNA-CIRCULAR', 'Columna circular', 5.000, 'CILINDRO', true, 1),
  ('COLUMNA-RECTANGULAR', 'Columna rectangular', 5.000, 'PRISMA', true, 1),
  ('LOSA-ALIVIANADA', 'Losa alivianada con bloques/nervios', 7.000, 'VOLUMEN_DIRECTO', true, 1),
  ('LOSA-MACIZA', 'Losa maciza', 5.000, 'PRISMA', true, 1),
  ('MURO-CONTENCION', 'Muro de contención o pantalla', 6.000, 'PRISMA', true, 1),
  ('VIGA-AEREA', 'Viga de carga o peraltada', 5.000, 'PRISMA', true, 1),
  ('VOLUMEN-DIRECTO', 'Volumen neto conocido', 5.000, 'VOLUMEN_DIRECTO', true, 1),
  ('ZAPATA', 'Zapata o plinto de cimentación', 5.000, 'PRISMA', true, 1);

CREATE TABLE zonas_flete (
  codigo text PRIMARY KEY,
  canton text NOT NULL,
  sector text NOT NULL,
  distancia_km numeric(9,3) NOT NULL CHECK(distancia_km >= 0),
  traslado_estimado_min integer NOT NULL CHECK(traslado_estimado_min > 0),
  tarifa_flete_m3 numeric(10,2) NOT NULL CHECK(tarifa_flete_m3 >= 0),
  activo boolean NOT NULL,
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);

INSERT INTO zonas_flete (codigo, canton, sector, distancia_km, traslado_estimado_min, tarifa_flete_m3, activo, version_configuracion) VALUES
  ('AMBATO-CENTRO-NORTE', 'Ambato', 'Ambato Centro y Norte (Ficoa / Miraflores / Atocha / Izamba)', 18.000, 35, 10.00, true, 1),
  ('AMBATO-SUR', 'Ambato', 'Ambato Sur (Huachi Chico / Huachi Grande / Totoras)', 14.000, 25, 8.50, true, 1),
  ('BANOS', 'Baños', 'Baños de Agua Santa (Casco Urbano)', 24.000, 40, 14.00, true, 1),
  ('CEVALLOS', 'Cevallos', 'Cevallos Centro y Alrededores', 11.000, 20, 7.50, true, 1),
  ('PATATE', 'Patate', 'Patate y Valle de los Cristos', 15.000, 28, 9.00, true, 1),
  ('PELILEO-CENTRO', 'Pelileo', 'Pelileo Centro y Matriz', 4.000, 12, 6.00, true, 1),
  ('PELILEO-GARCIA-MORENO', 'Pelileo', 'García Moreno y Huambaló', 8.000, 20, 7.50, true, 1),
  ('SALASACA', 'Pelileo', 'Salasaca (Vía Principal y Comunidades)', 2.000, 8, 5.00, true, 1),
  ('TISALEO', 'Tisaleo', 'Tisaleo Centro y Vía Alobamba', 17.000, 30, 9.50, true, 1);

CREATE TABLE camiones_mixer (
  codigo text PRIMARY KEY,
  placa text NOT NULL UNIQUE,
  marca_modelo text NOT NULL,
  capacidad_m3 numeric(8,3) NOT NULL CHECK(capacidad_m3 > 0),
  estado text NOT NULL CHECK(estado IN ('DISPONIBLE','MANTENIMIENTO','INACTIVO')),
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version)
);

INSERT INTO camiones_mixer (codigo, placa, marca_modelo, capacidad_m3, estado, version_configuracion) VALUES
  ('HT-MIX-01', 'TBA-4120', 'Hino 700 / Mixer McNeilus 8m³', 8.000, 'DISPONIBLE', 1),
  ('HT-MIX-02', 'TBH-6315', 'Mack Granite / Mixer Schwing Stetter 8m³', 8.000, 'DISPONIBLE', 1),
  ('HT-MIX-03', 'TBC-8942', 'Mercedes-Benz Actros / Mixer Cifa 8m³', 8.000, 'DISPONIBLE', 1),
  ('HT-MIX-04', 'TBJ-1209', 'International WorkStar / Mixer Putzmeister 8m³', 8.000, 'DISPONIBLE', 1),
  ('HT-MIX-05', 'TGH-8531', 'Mixer Mack Granite 2024', 8.000, 'DISPONIBLE', 1);

-- 4. CONDUCTORES
CREATE TABLE conductores (
  id uuid PRIMARY KEY,
  nombre_completo text NOT NULL,
  cedula text NOT NULL UNIQUE,
  licencia_tipo text NOT NULL,
  telefono text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX conductores_usuario_idx
  ON conductores(usuario_id)
  WHERE usuario_id IS NOT NULL;

INSERT INTO conductores (id, nombre_completo, cedula, licencia_tipo, telefono, activo, creado_en, usuario_id) VALUES
  ('50000000-0000-0000-0000-000000000001', 'Santiago Chango', '1800237609', 'Tipo E', '0999458712', true, '2026-10-14T02:55:17.186Z', '35dabd47-73cb-420a-834a-96d1695f5af9'),
  ('50000000-0000-0000-0000-000000000002', 'Francisco Cabrera', '1700043218', 'Tipo E', '0996874234', true, '2026-10-14T02:55:17.186Z', '53f5eb05-0d81-438c-b355-b4faa08ee33a'),
  ('d9804bfb-f2f4-4cd2-9c06-04ac6e6c5bba', 'Segundo Morales', '1501176795', 'Tipo E', '0982187126', true, '2026-10-16T05:56:34.320Z', '50d4b9fa-c154-4a5d-92e8-95e830c2cf1e');

-- 5. CLIENTES Y COTIZACIONES / PEDIDOS
CREATE TABLE clientes (
  id uuid PRIMARY KEY,
  nombre text NOT NULL,
  telefono text NOT NULL,
  email text,
  datos_demostracion boolean NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cotizaciones (
  id uuid PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  zona_codigo text NOT NULL REFERENCES zonas_flete(codigo),
  version_configuracion integer NOT NULL REFERENCES configuracion_versiones(version),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','CONTACTADA','APROBADA','RECHAZADA','VENCIDA')),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  datos_demostracion boolean NOT NULL,
  volumen_total_m3 numeric(14,6) NOT NULL CHECK(volumen_total_m3 > 0),
  total numeric(14,2) NOT NULL CHECK(total >= 0),
  snapshot jsonb NOT NULL,
  idempotency_hash text NOT NULL UNIQUE,
  solicitud_hash text NOT NULL,
  token_acceso_hash text NOT NULL,
  valida_hasta timestamptz NOT NULL,
  acceso_expira_en timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(valida_hasta > creado_en),
  CHECK(acceso_expira_en > creado_en)
);

CREATE INDEX cotizaciones_estado_fecha_idx ON cotizaciones(estado, creado_en DESC);
CREATE INDEX cotizaciones_cliente_idx ON cotizaciones(cliente_id);
CREATE INDEX cotizaciones_zona_idx ON cotizaciones(zona_codigo);
CREATE INDEX cotizaciones_configuracion_idx ON cotizaciones(version_configuracion);
CREATE INDEX cotizaciones_origen_fecha_idx ON cotizaciones(datos_demostracion, creado_en);

CREATE TABLE detalles_cotizacion (
  id uuid PRIMARY KEY,
  cotizacion_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT,
  posicion integer NOT NULL CHECK(posicion >= 0),
  elemento_codigo text NOT NULL REFERENCES elementos_constructivos(codigo),
  resistencia_codigo text NOT NULL REFERENCES resistencias(codigo),
  cantidad integer NOT NULL CHECK(cantidad > 0),
  volumen_neto_m3 numeric(14,6) NOT NULL CHECK(volumen_neto_m3 > 0),
  volumen_total_m3 numeric(14,6) NOT NULL CHECK(volumen_total_m3 > 0),
  desperdicio_pct numeric(6,3) NOT NULL CHECK(desperdicio_pct BETWEEN 0 AND 30),
  precio_unitario_m3 numeric(10,2) NOT NULL CHECK(precio_unitario_m3 > 0),
  subtotal_hormigon numeric(14,2) NOT NULL CHECK(subtotal_hormigon >= 0),
  snapshot jsonb NOT NULL,
  UNIQUE(cotizacion_id, posicion)
);

CREATE INDEX detalles_cotizacion_elemento_idx ON detalles_cotizacion(elemento_codigo);
CREATE INDEX detalles_cotizacion_resistencia_idx ON detalles_cotizacion(resistencia_codigo);

-- 6. DESPACHOS
CREATE TABLE despachos (
  id uuid PRIMARY KEY,
  pedido_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT,
  mixer_id text NOT NULL REFERENCES camiones_mixer(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
  conductor_id uuid NOT NULL REFERENCES conductores(id) ON DELETE RESTRICT,
  volumen_m3 numeric(8,3) NOT NULL CHECK(volumen_m3 > 0),
  hora_salida timestamptz,
  hora_llegada timestamptz,
  llegada_por_usuario_id uuid REFERENCES usuarios(id),
  hora_retorno timestamptz,
  retorno_por_usuario_id uuid REFERENCES usuarios(id),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA', 'ENTREGADO', 'CANCELADO')),
  iniciado_por_usuario_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  iniciado_en timestamptz,
  motivo_cancelacion text,
  cancelado_por_usuario_id uuid REFERENCES usuarios(id),
  cancelado_en timestamptz,
  incidentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX despachos_pedido_idx ON despachos(pedido_id);
CREATE INDEX despachos_mixer_idx ON despachos(mixer_id);
CREATE INDEX despachos_estado_idx ON despachos(estado);
CREATE INDEX despachos_conductor_estado_idx ON despachos(conductor_id, estado);
CREATE INDEX despachos_llegada_usuario_idx ON despachos(llegada_por_usuario_id);
CREATE INDEX despachos_retorno_usuario_idx ON despachos(retorno_por_usuario_id);

CREATE UNIQUE INDEX despachos_mixer_activo_unq
  ON despachos(mixer_id)
  WHERE estado IN ('PENDIENTE', 'EN_TRANSITO');

CREATE UNIQUE INDEX despachos_conductor_activo_unq
  ON despachos(conductor_id)
  WHERE estado IN ('PENDIENTE', 'EN_TRANSITO');

-- 7. AUDITORÍA Y EVENTOS SALIENTES (OUTBOX)
CREATE TABLE auditoria_eventos (
  id uuid PRIMARY KEY,
  autor_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  accion text NOT NULL,
  recurso_id text NOT NULL,
  datos jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_recurso_idx ON auditoria_eventos(recurso_id, creado_en DESC);
CREATE INDEX auditoria_autor_idx ON auditoria_eventos(autor_id);

CREATE TABLE eventos_salida (
  id uuid PRIMARY KEY,
  tipo text NOT NULL,
  recurso_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE RESTRICT,
  deduplicacion text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','ENTREGADO','FALLIDO')),
  intentos integer NOT NULL DEFAULT 0 CHECK(intentos >= 0),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eventos_salida_pendientes_idx ON eventos_salida(creado_en) WHERE estado = 'PENDIENTE';
CREATE INDEX eventos_salida_recurso_idx ON eventos_salida(recurso_id);
