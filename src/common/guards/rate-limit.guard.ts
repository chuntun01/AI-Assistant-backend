import {
  Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus,
} from "@nestjs/common";

const requestMap = new Map<string, { count: number; resetAt: number }>();

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  admin: { max: 200, windowMs: 60_000 },
  user:  { max: 20,  windowMs: 60_000 },
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req   = context.switchToHttp().getRequest();
    const user  = req.user;
    if (!user) return true;

    const key   = `${user.id}:chat`;
    const limit = LIMITS[user.role] || LIMITS.user;
    const now   = Date.now();
    const entry = requestMap.get(key);

    if (!entry || now > entry.resetAt) {
      requestMap.set(key, { count: 1, resetAt: now + limit.windowMs });
      return true;
    }

    if (entry.count >= limit.max) {
      throw new HttpException(
        `Rate limit: ${limit.max} requests/minute for role "${user.role}"`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count++;
    return true;
  }
}