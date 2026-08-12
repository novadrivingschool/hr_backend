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
