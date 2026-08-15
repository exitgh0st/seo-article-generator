import { InjectionToken } from '@angular/core';

/**
 * Base URL the API is reached at, without a trailing slash.
 *
 * Empty in development: requests go to a same-origin `/api` and proxy.conf.json
 * forwards them. In production the app is static files with no proxy of its own,
 * so `environment.prod.ts` names the API's origin in full and the calls are
 * cross-origin.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
