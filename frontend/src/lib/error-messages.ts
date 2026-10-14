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
};

const GENERIC = 'Algo salió mal. Inténtalo de nuevo.';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? (MESSAGES[error.code] ?? GENERIC) : GENERIC;
}
