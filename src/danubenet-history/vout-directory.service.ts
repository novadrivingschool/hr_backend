import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/** Registro del directorio de V-Outsourcing (vout-auth-users → internal/nickname-directory). */
export interface VoutNicknameRecord {
  employee_number: string;
  tcw_nickname: string;
  first_name: string;
  last_name: string;
  hire_date: string | null;
  is_active: boolean;
}

/** Se lanza cuando V-Out no responde / no está configurado: la fila NO debe marcarse como inexistente. */
export class VoutDirectoryUnavailableError extends Error {}

/**
 * Cliente backend-to-backend de vout-auth-users. Solo lectura. Se usa como
 * último fallback de `resolve-identities` cuando el identificador no existe
 * en Nova One (nickname ni DanubeNet).
 */
@Injectable()
export class VoutDirectoryService {
  private readonly logger = new Logger(VoutDirectoryService.name);
  private static readonly TIMEOUT_MS = 10_000;

  /** Directorio completo de nicknames TCW (incluye inactivos). */
  async fetchNicknameDirectory(): Promise<VoutNicknameRecord[]> {
    const base = (process.env.VOUT_AUTH_API || '').replace(/\/+$/, '');
    const key = process.env.INTERNAL_API_KEY || '';
    if (!base || !key) {
      this.logger.error('VOUT_AUTH_API / INTERNAL_API_KEY not configured');
      throw new VoutDirectoryUnavailableError('V-Outsourcing directory is not configured');
    }
    this.logger.log(`[V-OUT-FALLBACK] consultando ${base}/users/internal/nickname-directory`);
    try {
      const res = await axios.get(`${base}/users/internal/nickname-directory`, {
        params: { key },
        timeout: VoutDirectoryService.TIMEOUT_MS,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      this.logger.log(`[V-OUT-FALLBACK] V-Out respondió HTTP ${res.status}: ${list.length} usuario(s) con TCW nickname`);
      return list;
    } catch (err: any) {
      this.logger.error(`[V-OUT-FALLBACK] V-Out falló: HTTP ${err?.response?.status ?? 'sin respuesta'} · ${err?.code ?? ''} ${err?.message ?? ''} · ${JSON.stringify(err?.response?.data ?? {})}`);
      throw new VoutDirectoryUnavailableError('V-Outsourcing directory is unavailable');
    }
  }
}
