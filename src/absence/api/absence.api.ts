// api/absence.api.ts
import {
    SendAbsenceTemplateDto,
    SendAbsenceTemplateObjDto,
    SendAbsenceTemplateResponse,
} from '../dto/absence-email.dto';

/**
 * Cliente del recurso /absence-email del email_service.
 *
 * Recurso propio, independiente de /sending-email (time off). Se separó a
 * propósito para no acoplar los correos de absence al módulo de TOR.
 */
export class AbsenceApiClient {
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(fetchImpl: typeof fetch = fetch) {
        this.baseUrl =
            (process.env.EMAIL_SERVICE_BASE || '').replace(/\/+$/, '') + '/absence-email';
        this.apiKey = process.env.EMAIL_SERVICE_API_KEY || '';
        this.fetchImpl = fetchImpl;
        this.timeoutMs = Number(process.env.EMAIL_SERVICE_TIMEOUT_MS ?? 15000);
    }

    private headers(): HeadersInit {
        const h: HeadersInit = { 'Content-Type': 'application/json' };
        if (this.apiKey) h['x-api-key'] = this.apiKey;
        return h;
    }

    /**
     * A diferencia de TimeOffApiClient.post, este sí lleva timeout.
     * Sin él, un email_service colgado bloquea la creación de la absence
     * (y con ella la escritura del evento en el master schedule).
     */
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

    /** POST /absence-email/send-hr-template */
    sendHrTemplate(dto: SendAbsenceTemplateObjDto): Promise<SendAbsenceTemplateResponse> {
        return this.post('/send-hr-template', dto);
    }

    /** POST /absence-email/send-coordinator-template */
    sendCoordinatorTemplate(dto: SendAbsenceTemplateDto): Promise<SendAbsenceTemplateResponse> {
        return this.post('/send-coordinator-template', dto);
    }

    /** POST /absence-email/send-management-template */
    sendManagementTemplate(dto: SendAbsenceTemplateObjDto): Promise<SendAbsenceTemplateResponse> {
        return this.post('/send-management-template', dto);
    }

    /** POST /absence-email/notify-staff */
    sendStaffTemplate(dto: SendAbsenceTemplateDto): Promise<SendAbsenceTemplateResponse> {
        return this.post('/notify-staff', dto);
    }
}
