import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Identidad del empleado autenticado, extraida del JWT por HrJwtGuard.
 * Mismo patron que it_backend/src/novana/common/current-user.ts.
 */
export interface HrUser {
  employee_number: string;
  name: string;
  last_name: string;
  nova_email?: string;
  roles: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HrUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.hrUser as HrUser;
  },
);
