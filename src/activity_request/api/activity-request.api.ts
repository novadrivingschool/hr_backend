// api/activity-request.api.ts
import {
  SendActivityRequestTemplateDto,
  SendActivityRequestTemplateObjDto,
  SendTemplateResponse,
} from '../dto/activity-request-email.dto';

/**
 * Cliente del recurso /activity-request-email del email_service.
 *
 * Recurso propio y dedicado (mismo patrón que AbsenceApiClient/LoaApiClient),
 * deliberadamente NO el de /sending-email que usa TimeOffApiClient — ese
 * endpoint no existe en email_service (ver activity_request_feature en
 * memoria de proyecto). Con timeout explícito: sin él, un email_service
 * colgado podría bloquear la creación del activity request si algún día se
 * deja de hacer fire-and-forget.
 */
export class ActivityRequestApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(fetchImpl: typeof fetch = fetch) {
    this.baseUrl = (process.env.EMAIL_SERVICE_BASE || '').replace(/\/+$/, '') + '/activity-request-email';
    this.apiKey = process.env.EMAIL_SERVICE_API_KEY || '';
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Number(process.env.EMAIL_SERVICE_TIMEOUT_MS ?? 15000);
  }

  private headers(): HeadersInit {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey;
    return h;
  }

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

  /** POST /activity-request-email/send-coordinator-template */
  sendCoordinatorTemplate(dto: SendActivityRequestTemplateDto): Promise<SendTemplateResponse> {
    return this.post('/send-coordinator-template', dto);
  }

  /** POST /activity-request-email/send-staff-submitted-template */
  sendStaffSubmittedTemplate(dto: SendActivityRequestTemplateDto): Promise<SendTemplateResponse> {
    return this.post('/send-staff-submitted-template', dto);
  }

  /** POST /activity-request-email/send-hr-template */
  sendHRTemplate(dto: SendActivityRequestTemplateObjDto): Promise<SendTemplateResponse> {
    return this.post('/send-hr-template', dto);
  }

  /** POST /activity-request-email/send-management-template */
  sendManagementTemplate(dto: SendActivityRequestTemplateObjDto): Promise<SendTemplateResponse> {
    return this.post('/send-management-template', dto);
  }

  /** POST /activity-request-email/notify-staff */
  sendStaffTemplate(dto: SendActivityRequestTemplateDto): Promise<SendTemplateResponse> {
    return this.post('/notify-staff', dto);
  }
}
