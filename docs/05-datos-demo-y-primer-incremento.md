# Datos configurables y primer incremento funcional

Fecha: 3 de octubre de 2026. El usuario autoriza usar datos ficticios plausibles y dejar los parámetros editables para continuar el proyecto. Estos supuestos permiten avanzar en desarrollo; su verificación con la empresa queda para reemplazar la demostración por operación real.

La descripción comercial corresponde al primer incremento; la tabla de alcance y verificación incluye también la reportería añadida después. Consultar [ESTADO_DEL_PROYECTO.md](ESTADO_DEL_PROYECTO.md) para la entrega vigente y [CONTRIBUTING.md](../CONTRIBUTING.md) para integraciones del equipo.

## 1. Datos iniciales y procedencia

Las cinco resistencias provienen del acta. Las tarifas base y zonas se inspiran en el SQL entregado; no son un estudio de precios de mercado. Los demás números son supuestos sintéticos de desarrollo. Nombres de personal, placas y contactos son ficticios.

| Grupo | Valores iniciales | Edición |
| --- | --- | --- |
| Planta | Planta HormiGestión DEMO, Pelileo/Tungurahua; `America/Guayaquil`; lunes-sábado 07:00-17:00; 40 m³/h | Nombre, ubicación, zona horaria válida, días, horario diurno y capacidad |
| Resistencias | 180/210/240/280/350 kgf/cm²; USD 72/78/84/91/105 por m³ | Tarifa, especificación, descripción, estado; altas por código nuevo |
| Mixers | Tres unidades DEMO de 8, 7,5 y 8 m³; dos disponibles y una en mantenimiento | Capacidad, placa, marca/modelo y estado administrativo |
| Flete | Por zona y m³: USD 6-15/m³ en seis zonas; traslados estimados 12-45 min | Zonas, tarifa, distancia y tiempo; alternativa por km/viaje |
| Alternativa por distancia | 10 km incluidos; USD 2,50/km adicional por viaje estimado | Modelo, radio incluido y tarifa; no se suma al flete zonal |
| Bombeo | USD 12/m³, mínimo USD 120 | Habilitación, tarifa y mínimo |
| Impuesto | 15% ficticio para pruebas | Tasa; copiada al comprobante histórico |
| Desperdicio | Rango 0%-20%; sugerido por elemento 5%-8%; incremento de pedido 0,1 m³ | Rango, sugeridos e incremento |
| Vigencia y acceso | Cotización 7 días; token del comprobante 30 días | Duraciones para nuevas solicitudes |
| Condiciones | Anticipación de pedido/cambios 24 h; espera incluida 45 min; USD 25/h adicional | Valores y texto; cobros de incidentes aún no implementados |
| Ciclo operativo | Carga 15 min, descarga 30, retorno 30, lavado 15; referencia de viaje 8 m³ | Parámetros para la agenda futura |
| Calidad | Límite 90 min, alertas 60/80; edades 7/28; slump 75-125 mm y temperatura máxima 32 °C | Parámetros para el módulo futuro; referencia normativa/estado de verificación |

`datosDemostracion=true` identifica esta configuración. `calidad.referenciaVerificada=false` conserva la incertidumbre de INEN. Los parámetros técnicos son datos de prueba; este incremento no evalúa aceptación del hormigón ni emite certificados.

Los datos iniciales están en [demo.ts](../src/domain/demo.ts), y las validaciones en [configuracion.ts](../src/domain/configuracion.ts). Moneda USD, permisos y geometrías soportadas forman parte del contrato; añadir nuevos tipos de operación requiere ampliar el código, además de editar datos.

## 2. Edición con historial

1. Iniciar sesión como administrador con su contraseña local.
2. Obtener `GET /api/v1/admin/configuracion`: `version`, `configuracion`, `creadoEn` y `motivo`.
3. Modificar `configuracion` y enviar el objeto completo a `PUT /api/v1/admin/configuracion`, con `versionEsperada` y motivo.
4. El backend valida, guarda una versión inmutable, actualiza catálogos normalizados y cambia el puntero actual en una sola transacción.

Una versión desactualizada devuelve `409`. Umbrales invertidos, códigos/placas duplicados, tarifas con más de dos decimales o sugeridos fuera del rango devuelven error de validación. Conservar códigos previos y desactivarlos evita perder referencias; para mixers, usar `INACTIVO`.

Los snapshots de cotización guardan precios, cantidades, zona/flete, impuesto, bombeo, condiciones, vigencia y política temporal aplicados. Cambiar los valores actuales no modifica esos snapshots. Este incremento dispone de API administrativa; la pantalla para editar en el frontend sigue pendiente.

## 3. Ejemplo de cálculo y solicitud

Losa maciza de 10 × 5 × 0,1 m, FC-210, desperdicio sugerido 5%, AMBATO-HUACHI, sin bombeo. Enviar a `POST /api/v1/cotizaciones/calcular`:

```json
{
  "zonaCodigo": "AMBATO-HUACHI",
  "requiereBombeo": false,
  "detalles": [{
    "elementoCodigo": "LOSA-MACIZA",
    "resistenciaCodigo": "FC-210",
    "cantidad": 1,
    "medicion": { "tipo": "PRISMA", "largoM": "10", "anchoM": "5", "altoM": "0.1" }
  }]
}
```

| Concepto | Valor |
| --- | --- |
| Volumen neto | 5 m³ |
| Con desperdicio | 5,25 m³ |
| Redondeado al incremento de 0,1 | 5,3 m³ |
| Hormigón: 5,3 × USD 78 | USD 413,40 |
| Flete: 5,3 × USD 9 | USD 47,70 |
| Subtotal | USD 461,10 |
| Impuesto ficticio, redondeado a centavos | USD 69,17 |
| Total | **USD 530,27** |

Para registrar, enviar esos mismos campos a `POST /api/v1/cotizaciones` y añadir:

```json
{
  "versionConfiguracion": 1,
  "contacto": {
    "nombre": "Cliente ficticio DEMO",
    "telefono": "0990000000",
    "email": "cliente@demo.hormigestion.test"
  },
  "obra": {
    "direccion": "Dirección ficticia de obra DEMO",
    "fechaPreferida": "2026-11-06"
  }
}
```

Este segundo bloque contiene campos adicionales, no una solicitud independiente. Usar la versión devuelta por la API y una fecha actual/futura. Generar `Idempotency-Key` con `crypto.randomUUID()` en el cliente.

Una creación devuelve `201`, `cotizacion`, `tokenComprobante` y `replayed=false`. El reintento idéntico devuelve `200` con la misma cotización/token; reutilizar la clave para otra solicitud devuelve `409`. Si cambian tarifas antes de confirmar una solicitud nueva, la API pide recalcular.

Decimales: se aceptan números o texto decimal y se devuelven cadenas. Decimal.js evita cálculos monetarios con punto flotante binario; volumen con seis decimales y dinero con dos. Cada detalle se redondea hacia arriba al incremento de volumen configurado; 5,3 m³ no se convierte en 6 m³ enteros.

Geometrías: prisma rectangular, cilindro por diámetro/altura y volumen neto directo. Para losa alivianada se exige volumen neto conocido, evitando contar bloques/casetones como hormigón sólido. La cantidad multiplica el volumen de la medición. Se admiten varias resistencias y volúmenes mayores que un mixer; los viajes son una estimación por capacidad de referencia, sin asignación real.

## 4. Acceso y transiciones

| Acción | Actor |
| --- | --- |
| Catálogos, cálculo y registro | Público |
| Comprobante/PDF | Visitante con token propio vigente; administrador/despachador |
| Listar/contactar/aprobar/rechazar cotizaciones | Administrador/despachador |
| Configuración/historial y personal | Administrador |
| Flota administrativa | Administrador/despachador |
| Identidad propia | Cualquier cuenta activa |

Roles canónicos provisionales: `ADMINISTRADOR`, `DESPACHADOR`, `LABORATORISTA`, `CONDUCTOR`. El visitante no puede listar clientes/cotizaciones. Conductor/calidad tienen cuentas preparadas; sus casos de uso operativos se implementarán con sus módulos.

Transiciones: `PENDIENTE → CONTACTADA → APROBADA`; rechazo desde pendiente/contactada; vencimiento derivado del reloj del servidor. Las acciones privadas requieren versión esperada y motivo. La aprobación es comercial y aún no genera programación. Debe conservarse al menos un administrador activo.

## 5. Estado del alcance

| Área | Estado |
| --- | --- |
| BE-01 Identidad | Login, identidad, creación/edición/desactivación; JWT validado y cuenta/rol leídos en DB por solicitud |
| BE-02 Catálogos | Parámetros editables, revisión atómica, historial y flota administrativa |
| BE-03 Cotización | Cálculo, registro idempotente, snapshot histórico, comprobante/PDF y transiciones comerciales |
| BE-04/05 Logística | Parámetros preparados; pedidos, reservas, asignación y cronómetro pendientes |
| BE-06 Calidad | Parámetros preparados; controles, muestreos, probetas, roturas y dossier pendientes |
| BE-07 Proyección | Reportería y proyección estadística de cotizaciones implementadas; evaluación con pedidos/despachos reales pendiente. Véase [módulo 3.5](06-dashboard-y-reporteria.md) |
| BE-08 Operación | Pool, migraciones/checksum, usuario limitado, logs, salud, cierre ordenado y outbox; worker n8n, respaldo/restauración y producción pendientes |
| Frontend | Sitio/catálogo y dashboard/reportería integrados; cotizador, edición de configuración/personal y módulos operativos pendientes. Véase [estado del frontend](../../hormigestion-frontend/docs/ESTADO_DEL_PROYECTO.md) |

No se ejecutó el DDL destructivo. `001_base.sql` crea las entidades de este incremento; el resto se añade con migraciones nuevas. La cuenta de aplicación carece de permisos de borrado, DDL y modificación de versiones históricas.

## 6. Verificación

- 23 pruebas de reglas: geometrías, redondeos, flete, bombeo, tarifas, rangos, configuración, agregación y proyección.
- 26 pruebas integradas con PostgreSQL real: permisos/JWT, cuentas inactivas, reintentos concurrentes, outbox/rollback, snapshots, revisión concurrente, estados/vigencia, PDF, CORS, JSON inválido, límite de login, filtros/reportes, CSV y semilla histórica.
- Node.js 24 LTS y PostgreSQL 16; TypeScript y build de Docker correctos.
- PDF extraído y revisado visualmente; fuentes Liberation Sans incorporadas con su licencia.
- Base de pruebas temporal eliminada; secretos/artefactos locales excluidos de Git; documentos originales conservados. La integración del frontend se documenta en su propio repositorio.

Estas pruebas verifican el incremento implementado. El contrato de rutas existentes está en `GET /api/v1/openapi.json` y [openapi.ts](../src/infrastructure/openapi.ts).
