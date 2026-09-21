import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { hasNovaOnePermission } from '../nova-one-permissions.client';

/**
 * Mismo patron que it_backend/src/common/guards/permission.guard.ts.
 * Debe ejecutarse SIEMPRE despues de HrJwtGuard (que es quien pone
 * `request.hrUser`); el orden lo fija @UseGuards en el controller.
 */
export const PERMISSION_KEY = 'requiredNovaOnePermission';
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.hrUser;
    const employeeNumber = String(user?.employee_number ?? '').trim();

    const allowed = await hasNovaOnePermission(employeeNumber, required);
    if (!allowed) {
      throw new ForbiddenException(
        `Requiere el permiso '${required}'. Pedile a un administrador que lo active en la consola de permisos (NOVA ONE Permissions).`,
      );
    }
    return true;
  }
}
