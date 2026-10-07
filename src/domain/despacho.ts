import { z } from "zod";
import { AppError } from "./errors.js";

// Regla RF-09 / OP-03: Capacidad máxima segura del mixer
export const CAPACIDAD_MAXIMA_MIXER_M3 = 8.0;

// Regla RF-10 / OP-06: Ventana crítica de fraguado
export const LIMITE_FRAGUADO_MINUTOS = 90;

// Esquema de validación para asignar un mixer a un viaje
export const asignarMixerSchema = z.object({
  pedidoId: z.string().uuid(),
  mixerId: z.string().trim().min(1),
  conductorId: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "El conductor seleccionado no es válido",
  ),
  volumenM3: z.coerce
    .number()
    .positive("El volumen debe ser mayor a 0")
    .max(
      CAPACIDAD_MAXIMA_MIXER_M3,
      `El volumen excede la capacidad máxima de ${CAPACIDAD_MAXIMA_MIXER_M3} m³ del camión asignado.`
    ),
});

export type AsignarMixerInput = z.infer<typeof asignarMixerSchema>;

export type EstadoAlerta = "NORMAL" | "ADVERTENCIA" | "CRITICO" | "VENCIDO";

/**
 * OP-06: Evalúa el tiempo transcurrido desde la salida de planta.
 * Retorna el estado de alerta según los umbrales de fraguado.
 */
export function evaluarAlertaFraguado(horaSalidaISO: string, horaActualISO: string): { estado: EstadoAlerta; minutosTranscurridos: number } {
  const salida = new Date(horaSalidaISO).getTime();
  const actual = new Date(horaActualISO).getTime();

  if (isNaN(salida) || isNaN(actual)) {
    throw new AppError(400, "FECHAS_INVALIDAS", "Las fechas proporcionadas no son válidas.");
  }
  
  if (actual < salida) {
    return { estado: "NORMAL", minutosTranscurridos: 0 };
  }

  const minutosTranscurridos = Math.floor((actual - salida) / 60000);

  let estado: EstadoAlerta = "NORMAL";
  
  if (minutosTranscurridos > LIMITE_FRAGUADO_MINUTOS) {
    estado = "VENCIDO"; // > 90 min (Pérdida material)
  } else if (minutosTranscurridos >= 80) {
    estado = "CRITICO"; // 80 a 90 min
  } else if (minutosTranscurridos >= 60) {
    estado = "ADVERTENCIA"; // 60 a 79 min
  }

  return { estado, minutosTranscurridos };
}
