import { ApiError } from './api-error';

/** Spanish text for the API's error codes. Unknown codes fall back to a generic message. */
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.',
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
  CURRENT_PASSWORD_INCORRECT: 'La contraseña actual no es correcta.',
  PASSWORD_UNCHANGED: 'La nueva contraseña debe ser distinta de la actual.',
  SUPERADMIN_ONLY: 'Solo el superadmin puede hacer esto.',
  USER_NOT_FOUND: 'Ese usuario ya no existe.',
  CANNOT_RESET_OWN_PASSWORD: 'Cambia tu propia contraseña desde tu cuenta.',
  SESSION_INVALID: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  REFRESH_TOKEN_REUSED: 'Tu sesión se cerró por seguridad. Vuelve a iniciar sesión.',
  AUDIT_CURSOR_INVALID:
    'No se pudo cargar esa página de la bitácora. Recarga e inténtalo de nuevo.',
  UNIT_NUMBER_INVALID: 'Ese depto no existe.',
  // Shifts and write windows
  NOT_RESPONSIBLE: 'Ese turno no te corresponde.',
  OUTSIDE_WRITE_WINDOW: 'Ya pasó tu plazo para hacer esto; pídeselo al superadmin.',
  HANDOVER_INVALID:
    'La entrega empieza en el primer mes del turno siguiente y es porque no lo toma.',
  DELEGATION_INVALID: 'Esa delegación no es válida para ese turno.',
  DELEGATIONS_OVERLAP: 'Ya hay una delegación en esos meses. Cancélala primero.',
  DELEGATE_INACTIVE: 'El depto que cubre está inactivo en esos meses.',
  DELEGATION_NOT_FOUND: 'Esa delegación ya no existe.',
  DELEGATION_ALREADY_CANCELLED: 'Esa delegación ya estaba cancelada.',
  CALENDAR_RANGE_INVALID: 'Ese rango de meses no es válido.',
  // Deptos and rates
  UNIT_NOT_FOUND: 'Ese depto no existe.',
  UNIT_ALREADY_INACTIVE: 'El depto ya está inactivo en esos meses.',
  UNIT_NOT_INACTIVE: 'El depto no está inactivo en ese mes.',
  RATES_NOT_CONFIGURED: 'Faltan las tarifas; el superadmin debe configurarlas.',
  RATE_NOT_DEFINED: 'No hay tarifa vigente para ese mes.',
};

const GENERIC = 'Algo salió mal. Inténtalo de nuevo.';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? (MESSAGES[error.code] ?? GENERIC) : GENERIC;
}
