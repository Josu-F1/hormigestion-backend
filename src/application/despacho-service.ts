import { randomUUID } from "node:crypto";
import type { Actor } from "../domain/configuracion.js";
import { asignarMixerSchema, evaluarAlertaFraguado, type AsignarMixerInput } from "../domain/despacho.js";
import { AppError } from "../domain/errors.js";
import type { DespachoRepository, DespachoRecord } from "../domain/repositories.js";
import { requireRole } from "./services.js";

export class DespachoService {
  constructor(
    private readonly repository: DespachoRepository,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * OP-03: Asigna un mixer y conductor a un pedido.
   * Valida la capacidad máxima permitida (8 m³).
   */
  async asignarMixerViaje(input: AsignarMixerInput, actor: Actor): Promise<DespachoRecord> {
    // RBAC: Solo administradores y operadores de despacho pueden asignar.
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);

    // Valida la entrada contra el esquema puro de dominio
    const data = asignarMixerSchema.parse(input);
    const pedido = await this.repository.obtenerPedidoAprobado(data.pedidoId);
    if (!pedido) throw new AppError(422, "PEDIDO_NO_APROBADO", "El pedido debe existir y estar aprobado antes de asignar un mixer");
    if (data.volumenM3 > pedido.volumenM3) {
      throw new AppError(422, "VOLUMEN_SUPERA_PEDIDO", "El volumen del viaje no puede superar el volumen pendiente del pedido");
    }

    return this.repository.crearDespacho({
      id: randomUUID(),
      pedidoId: data.pedidoId,
      mixerId: data.mixerId,
      conductorId: data.conductorId,
      volumenM3: data.volumenM3,
    });
  }

  async conductoresDisponibles(actor: Actor) {
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);
    return this.repository.obtenerConductoresDisponibles();
  }

  /**
   * OP-06: Inicia el conteo regresivo oficial del viaje (90 minutos).
   */
  async iniciarTransito(despachoId: string, actor: Actor): Promise<DespachoRecord> {
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);
    throw new AppError(409, "INICIO_REQUIERE_CONDUCTOR", "El tránsito debe ser iniciado por el conductor asignado");
  }

  async despachoDelConductor(actor: Actor) {
    requireRole(actor, ["CONDUCTOR"]);
    return this.repository.obtenerDespachoDelConductor(actor.id);
  }

  async iniciarTransitoComoConductor(despachoId: string, actor: Actor) {
    requireRole(actor, ["CONDUCTOR"]);
    return this.repository.iniciarTransitoComoConductor(despachoId, actor.id, this.clock().toISOString());
  }

  async registrarLlegadaComoConductor(despachoId: string, actor: Actor) {
    requireRole(actor, ["CONDUCTOR"]);
    return this.repository.registrarLlegadaComoConductor(despachoId, actor.id, this.clock().toISOString());
  }

  async registrarRetornoComoConductor(despachoId: string, actor: Actor) {
    requireRole(actor, ["CONDUCTOR"]);
    return this.repository.registrarRetornoComoConductor(despachoId, actor.id, this.clock().toISOString());
  }

  /**
   * Monitor de Trazabilidad: Devuelve los despachos activos
   * con su estado calculado de alerta de fraguado.
   */
  async viajesActivos(actor: Actor) {
    // RBAC: Choferes solo deben ver el suyo, pero aquí cargamos todos
    // y asumimos que el frontend o controlador filtra si es necesario.
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);

    const activos = await this.repository.obtenerViajesActivos();
    const horaActual = this.clock().toISOString();

    return activos.map(viaje => {
      // Si el viaje no tiene hora de salida, está pendiente, no corre el tiempo aún
      if (!viaje.horaSalida) {
        return {
          ...viaje,
          alerta: { estado: "NORMAL", minutosTranscurridos: 0 }
        };
      }

      // Evaluamos el tiempo usando la regla de negocio
      const alerta = evaluarAlertaFraguado(viaje.horaSalida, horaActual);
      
      return {
        ...viaje,
        alerta
      };
    });
  }
}
