import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

import { HrUser } from '../current-user';

/**
 * Valida el JWT que emite nova-one-backend (`src/utils/generateToken.py`):
 *   - algoritmo HS256, firmado con SECRET_KEY_TOKEN
 *   - claims usados aqui: employee_number, name, last_name, nova_email, roles
 *
 * Mismo patron que it_backend/src/novana/common/novana-jwt.guard.ts -- se
 * fija `algorithms: ['HS256']` de forma explicita para cerrar el ataque de
 * confusion de algoritmo. hr_backend no tenia NINGUNA verificacion de JWT
 * antes de esto (ningun controller la usaba); este guard es el primero.
 *
 * El token nunca se escribe en los logs.
 */
@Injectable()
export class HrJwtGuard implements CanActivate {
  private readonly logger = new Logger(HrJwtGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const header: string = request.headers?.authorization ?? '';

    const [scheme, token] = header.split(' ');
    if (!token || String(scheme).toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Missing bearer token');
    }

    const secret = process.env.SECRET_KEY_TOKEN;
    if (!secret) {
      // Falla cerrado: sin secreto no se puede verificar nada.
      this.logger.error('SECRET_KEY_TOKEN is not configured — rejecting request');
      throw new InternalServerErrorException('Auth is not configured');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      throw new UnauthorizedException(`Invalid token (${reason})`);
    }

    const employeeNumber = String(payload.employee_number ?? payload.user_id ?? '').trim();
    if (!employeeNumber) {
      throw new UnauthorizedException('Token has no employee_number');
    }

    const user: HrUser = {
      employee_number: employeeNumber,
      name: String(payload.name ?? '').trim(),
      last_name: String(payload.last_name ?? '').trim(),
      nova_email: payload.nova_email ? String(payload.nova_email).trim() : undefined,
      roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
    };

    request.hrUser = user;
    return true;
  }
}
