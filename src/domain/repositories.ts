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
  estado: "PENDIENTE" | "EN_TRANSITO" | "EN_OBRA" | "ENTREGADO";
  iniciadoPorUsuarioId: string | null;
  iniciadoEn: string | null;
};

export interface DespachoRepository {
  obtenerPedidoAprobado(pedidoId: string): Promise<{ volumenM3: number } | null>;
  obtenerConductoresDisponibles(): Promise<{ id: string; nombre: string; disponible: boolean }[]>;
  crearDespacho(despacho: Omit<DespachoRecord, "horaSalida" | "horaLlegada" | "horaRetorno" | "estado" | "iniciadoPorUsuarioId" | "iniciadoEn" | "llegadaPorUsuarioId" | "retornoPorUsuarioId">): Promise<DespachoRecord>;
  iniciarTransito(despachoId: string, horaSalida: string): Promise<DespachoRecord>;
  obtenerDespachoDelConductor(usuarioId: string): Promise<DespachoRecord | null>;
  iniciarTransitoComoConductor(despachoId: string, usuarioId: string, horaSalida: string): Promise<DespachoRecord>;
  registrarLlegadaComoConductor(despachoId: string, usuarioId: string, horaLlegada: string): Promise<DespachoRecord>;
  registrarRetornoComoConductor(despachoId: string, usuarioId: string, horaRetorno: string): Promise<DespachoRecord>;
  obtenerViajesActivos(): Promise<DespachoRecord[]>;
}
