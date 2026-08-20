import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { r2Config } from '../config.js';

export function isR2Configured(): boolean {
  return !!(
    r2Config.accountId &&
    r2Config.accessKeyId &&
    r2Config.secretAccessKey &&
    r2Config.bucketName &&
    r2Config.publicUrl
  );
}

let testClient: S3Client | null = null;

/** Solo para pruebas: reemplaza el cliente de R2 (ej. por un fake sin red) — mismo patrón que
 * setStripeClientForTesting. */
export function setR2ClientForTesting(client: S3Client): void {
  testClient = client;
}

// Cliente creado bajo demanda (no en el import top-level): mientras R2 no esté configurado
// (isR2Configured() falso), nada debería siquiera intentar construir un S3Client con
// credenciales undefined.
function getClient(): S3Client {
  if (testClient) return testClient;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2Config.accessKeyId!,
      secretAccessKey: r2Config.secretAccessKey!,
    },
  });
}

/** Sube un archivo a R2 bajo `key` y devuelve su URL pública (bucket con acceso público vía
 * r2.dev habilitado, ver server/.env.example). Sobreescribe si `key` ya existe — usado para la
 * foto de perfil del entrenador, que usa siempre la misma key por coach (ver coachProfileService),
 * así una foto nueva reemplaza a la anterior en vez de acumular huérfanas en el bucket. */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({ Bucket: r2Config.bucketName, Key: key, Body: body, ContentType: contentType }),
  );
  return `${r2Config.publicUrl}/${key}`;
}

/** Borra un objeto de R2 por key — usado por las notas de voz una vez transcritas (con éxito o
 * reintentos agotados, ver decisión #39 en db/schema.sql); no es un error si `key` no existe. */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: r2Config.bucketName, Key: key }));
}

/** Inverso de uploadObject's `${publicUrl}/${key}` — para poder borrar un objeto del que solo se
 * guardó la URL pública (voice_notes.audio_url), no la key. */
export function keyFromPublicUrl(url: string): string {
  return url.slice(r2Config.publicUrl!.length + 1);
}
