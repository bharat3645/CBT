import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/**
 * Reads tenant/user set by the core auth guard on the request
 * (`req.instituteId`, `req.user.id`). Swap for the core decorators when they land.
 */
export const InstituteId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.instituteId ?? req.session?.activeOrganizationId;
});
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const req = ctx.switchToHttp().getRequest();
  return req.user?.id ?? req.session?.user?.id ?? null;
});
