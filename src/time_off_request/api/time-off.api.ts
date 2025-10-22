// api/time-off.api.ts
import {
  SendTimeOffTemplateDto,
  SendTemplateResponse,
  SendTimeOffTemplateObjDto,
} from '../dto/time-off.dto';

export class TimeOffApiClient {
  private baseUrl: string;
  private apiKey: string;
  private fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = fetch) {
    // ⚡ lee de variables de entorno
    this.baseUrl = (process.env.EMAIL_SERVICE_BASE || '').replace(/\/+$/, '') + '/sending-email';
    this.apiKey = process.env.EMAIL_SERVICE_API_KEY || '';
    this.fetchImpl = fetchImpl;
  }

  private headers(): HeadersInit {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['x-api-key'] = this.apiKey; // asegúrate que tu ApiKeyGuard usa "x-api-key"
    return h;
  }

  private async post<TBody, TResp>(path: string, body: TBody): Promise<TResp> {
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} – ${text}`);
    }
    return (await res.json()) as TResp;
  }

  /** POST /time-off-requests/send-coordinator-template */
  sendCoordinatorTemplate(dto: SendTimeOffTemplateDto): Promise<SendTemplateResponse> {
    console.log("<<< dto: ", dto);
    return this.post('/send-coordinator-template', dto);
  }

  sendStaffSubmittedTorTemplate(dto: SendTimeOffTemplateDto): Promise<SendTemplateResponse> {
    console.log("<<< dto: ", dto);
    return this.post('/send-staff-tor-template', dto);
  }

  /** POST /time-off-requests/send-hr-template */
  sendHRTemplate(dto: SendTimeOffTemplateObjDto): Promise<SendTemplateResponse> {
    return this.post('/send-hr-template', dto);
  }

  /** POST /time-off-requests/send-management-template */
  sendManagementTemplate(dto: SendTimeOffTemplateObjDto): Promise<SendTemplateResponse> {
    return this.post('/send-management-template', dto);
  }

  /** POST /notify-staff */
  sendStaffTemplate(dto: SendTimeOffTemplateDto): Promise<SendTemplateResponse> {
    return this.post('/notify-staff', dto);
  }



}
