import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

// Cliente creado bajo demanda (no en el import top-level): mientras R2 no esté configurado
// (isR2Configured() falso), nada debería siquiera intentar construir un S3Client con
// credenciales undefined.
function getClient(): S3Client {
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
