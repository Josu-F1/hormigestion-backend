import type { Actor, Configuration, Role, VersionedConfiguration } from "./configuracion.js";
import type { Quotation, QuotationState } from "./cotizacion.js";

export type UserRecord = Actor & { passwordHash: string; activo: boolean; datosDemostracion: boolean };
export type PublicUser = Omit<UserRecord, "passwordHash">;
export type NewUser = PublicUser & { passwordHash: string };
export type UserChanges = { nombre?: string; rol?: Role; activo?: boolean; passwordHash?: string };
export type SavedQuotation = { cotizacion: Quotation; tokenHash: string };

export interface ConfigurationRepository {
  current(): Promise<VersionedConfiguration>;
  history(): Promise<{ version: number; motivo: string; creadoEn: string; autorId: string | null }[]>;
  update(config: Configuration, expectedVersion: number, reason: string, actor: Actor): Promise<VersionedConfiguration>;
}
export interface UserRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  users(): Promise<PublicUser[]>;
  createUser(user: NewUser, actor: Actor): Promise<PublicUser>;
  updateUser(id: string, changes: UserChanges, actor: Actor): Promise<PublicUser>;
}
export interface QuotationRepository {
  createQuotation(keyHash: string, inputHash: string, build: (config: VersionedConfiguration) => SavedQuotation): Promise<{ cotizacion: Quotation; replayed: boolean }>;
  quotation(id: string): Promise<SavedQuotation | null>;
  quotations(limit: number, offset: number, filters?: { estado?: QuotationState; q?: string }): Promise<{ items: Quotation[]; total: number }>;
  changeQuotationState(id: string, target: QuotationState, expectedVersion: number, reason: string, actor: Actor, now: Date): Promise<Quotation>;
}

export type DespachoRecord = {
  id: string;
  pedidoId: string;
  mixerId: string;
  conductorId: string;
  volumenM3: number;
  horaSalida: string | null;
  horaLlegada: string | null;
  llegadaPorUsuarioId: string | null;
  horaRetorno: string | null;
  retornoPorUsuarioId: string | null;
  estado: "PENDIENTE" | "EN_TRANSITO" | "EN_OBRA" | "ENTREGADO" | "CANCELADO";
  iniciadoPorUsuarioId: string | null;
  iniciadoEn: string | null;
  motivoCancelacion?: string | null;
  canceladoPorUsuarioId?: string | null;
  canceladoEn?: string | null;
  mixerPlaca?: string | null;
  mixerMarcaModelo?: string | null;
  mixerCapacidadM3?: number | null;
  clienteNombre?: string | null;
  clienteTelefono?: string | null;
  obraDireccion?: string | null;
  obraSector?: string | null;
  obraCanton?: string | null;
  incidentes?: Array<{ id: string; fecha: string; tipo: string; descripcion: string; usuarioNombre?: string }> | null;
  tipoHormigon?: string | null;
};

export type ConductorDetallado = {
  id: string;
  nombreCompleto: string;
  cedula: string;
  licenciaTipo: string;
  telefono: string;
  activo: boolean;
  disponible: boolean;
  usuarioId?: string | null;
  email?: string | null;
};

export interface DespachoRepository {
  obtenerPedidoAprobado(pedidoId: string): Promise<{ volumenM3: number } | null>;
  obtenerConductoresDisponibles(): Promise<{ id: string; nombre: string; telefono: string; disponible: boolean }[]>;
  obtenerTodosConductores(): Promise<ConductorDetallado[]>;
  crearConductor(input: { id: string; nombreCompleto: string; cedula: string; licenciaTipo: string; telefono: string; email?: string; password?: string }): Promise<ConductorDetallado>;
  actualizarConductor(id: string, input: { nombreCompleto?: string; cedula?: string; licenciaTipo?: string; telefono?: string; activo?: boolean; email?: string; password?: string }): Promise<ConductorDetallado>;
  cambiarEstadoConductor(id: string, activo: boolean): Promise<ConductorDetallado>;
  crearDespacho(despacho: Omit<DespachoRecord, "horaSalida" | "horaLlegada" | "horaRetorno" | "estado" | "iniciadoPorUsuarioId" | "iniciadoEn" | "llegadaPorUsuarioId" | "retornoPorUsuarioId" | "mixerPlaca" | "mixerMarcaModelo" | "mixerCapacidadM3" | "clienteNombre" | "obraDireccion" | "obraSector" | "obraCanton" | "incidentes" | "motivoCancelacion" | "canceladoPorUsuarioId" | "canceladoEn">): Promise<DespachoRecord>;
  iniciarTransito(despachoId: string, horaSalida: string): Promise<DespachoRecord>;
  obtenerDespachoDelConductor(usuarioId: string): Promise<DespachoRecord | null>;
  iniciarTransitoComoConductor(despachoId: string, usuarioId: string, horaSalida: string): Promise<DespachoRecord>;
  registrarLlegadaComoConductor(despachoId: string, usuarioId: string, horaLlegada: string): Promise<DespachoRecord>;
  registrarRetornoComoConductor(despachoId: string, usuarioId: string, horaRetorno: string): Promise<DespachoRecord>;
  reportarIncidente(despachoId: string, input: { tipo: string; descripcion: string }, actor: Actor): Promise<DespachoRecord>;
  cancelarDespacho(despachoId: string, motivo: string, actor: Actor): Promise<DespachoRecord>;
  obtenerHistorialViajesDelConductor(usuarioId: string): Promise<DespachoRecord[]>;
  obtenerViajesActivos(): Promise<DespachoRecord[]>;
}
