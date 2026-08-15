import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { ContentSource, ApiContentSource } from './core/services/content-source';
import { API_BASE_URL } from './core/api.config';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Empty in development — the dev-server proxy forwards a same-origin /api.
    // Absolute in production, where the app is static files and the API is a
    // separate origin.
    { provide: API_BASE_URL, useValue: environment.apiUrl },
    { provide: ContentSource, useClass: ApiContentSource },
  ],
};
