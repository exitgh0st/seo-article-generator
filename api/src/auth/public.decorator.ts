import { SetMetadata } from '@nestjs/common';

/** Metadata key read by `JwtAuthGuard` to skip JWT verification for a route. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as publicly accessible, bypassing `JwtAuthGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
