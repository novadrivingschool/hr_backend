import axios from 'axios';

/**
 * Thin client for aws_services_backend's dedicated `leave-of-absence/files`
 * resource (see LoaFilesModule) — used ONLY to clean up S3 objects when a
 * LOA record (or one of its department-log attachments) is deleted server
 * side, so we never leave orphaned files in the bucket after the DB row is
 * gone.
 *
 * Mirrors the same "best-effort, never throws into the caller's main
 * transaction" convention used by it-api.client.ts: callers are expected to
 * wrap this in their own non-blocking try/catch (or Promise.allSettled) and
 * must NOT let a failure here block deleting the DB record itself.
 */
function baseUrl(): string {
  const url = (process.env.AWS_SERVICES_URL ?? '').trim();
  if (!url) {
    throw new Error('AWS_SERVICES_URL is not configured');
  }
  return url.replace(/\/+$/, '');
}

export async function deleteLoaS3File(loaId: string, key: string): Promise<void> {
  await axios.delete(`${baseUrl()}/leave-of-absence/files`, {
    params: { loaId, key },
    timeout: 7000,
  });
}

/**
 * Borra un adjunto de HR WhatsApp Updates, vía el recurso dedicado
 * `hr-whatsapp-updates/files` (ver HrWhatsappFilesModule en
 * aws_services_backend) — NO el endpoint genérico `/s3/delete/no-employee`.
 * Ese endpoint valida server-side que `key` realmente pertenezca a
 * `updateId` antes de borrar (ver isKeyOwnedByUpdate), así que un updateId
 * incorrecto o una key ajena nunca borran el archivo de otro registro.
 */
export async function deleteHrWhatsappS3File(updateId: string, key: string): Promise<void> {
  await axios.delete(`${baseUrl()}/hr-whatsapp-updates/files`, {
    params: { updateId, key },
    timeout: 7000,
  });
}
