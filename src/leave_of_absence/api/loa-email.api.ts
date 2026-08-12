// api/loa-email.api.ts
import { SendLoaTemplateDto, SendLoaTemplateResponse } from '../dto/loa-email.dto';

/**
 * Cliente del recurso /loa-email del email_service.
 *
 * Recurso propio, independiente de /absence-email y de /sending-email (time
 * off) — mismo criterio que AbsenceApiClient (src/absence/api/absence.api.ts).
 */
export class LoaEmailApiClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(fetchImpl: typeof fetch = fetch) {
        this.baseUrl =
            (process.env.EMAIL_SERVICE_BASE || '').replace(/\/+$/, '') + '/loa-email';
        this.apiKey = process.env.EMAIL_SERVICE_API_KEY || '';
        this.fetchImpl = fetchImpl;
        this.timeoutMs = Number(process.env.EMAIL_SERVICE_TIMEOUT_MS ?? 15000);
    }

    private headers(): HeadersInit {
        const h: HeadersInit = { 'Content-Type': 'application/json' };
        if (this.apiKey) h['x-api-key'] = this.apiKey;
        return h;
    }

    /** Con timeout — un email_service colgado no debe bloquear la operación del LOA. */
    private async post<TBody, TResp>(path: string, body: TBody): Promise<TResp> {
        const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const res = await this.fetchImpl(url, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} ${res.statusText} – ${text}`);
            }

            return (await res.json()) as TResp;
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                throw new Error(`Timeout after ${this.timeoutMs}ms calling ${url}`);
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /** POST /loa-email/send-template */
    sendTemplate(dto: SendLoaTemplateDto): Promise<SendLoaTemplateResponse> {
        return this.post('/send-template', dto);
    }
}
