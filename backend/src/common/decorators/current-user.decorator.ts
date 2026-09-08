import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Lets controllers write @CurrentUser() instead of digging into the raw request.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
