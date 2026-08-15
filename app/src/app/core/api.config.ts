import { InjectionToken } from '@angular/core';

/**
 * Base URL the API is reached at.
 *
 * In the browser this is empty — requests go to a same-origin `/api`, which
 * proxy.conf.json forwards in development and a reverse proxy handles in
 * production. During server-side rendering there is no origin to be relative to,
 * so app.config.server.ts supplies an absolute URL instead.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
