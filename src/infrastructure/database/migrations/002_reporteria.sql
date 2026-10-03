-- Rango temporal y origen se filtran antes de consolidar cabeceras y detalles.
CREATE INDEX cotizaciones_origen_fecha_idx ON cotizaciones(datos_demostracion, creado_en);
