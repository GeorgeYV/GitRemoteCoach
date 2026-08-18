const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Formularios con correo en texto libre (login, registro, recuperar contraseña, contacto de
 * club) validan con esto antes de mandar al backend — si no, el error crudo de Zod
 * (z.string().email()) se le mostraba tal cual al usuario. No pretende ser un regex RFC 5322
 * completo, solo atajar los casos obvios (sin @, sin dominio) antes de gastar un viaje al
 * servidor. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
