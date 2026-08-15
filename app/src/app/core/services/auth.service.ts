import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';

const TOKEN_KEY = 'cyberbrief.token';

interface LoginResponse {
  token: string;
  expiresIn: number;
}

/**
 * Single-operator auth. One password traded for a bearer token.
 *
 * The token lives in localStorage, which is readable by any script on the origin.
 * That is an accepted trade for a single-user admin tool with no third-party
 * scripts on the page; it would not be acceptable if this had real accounts.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _token = signal<string | null>(this.readStoredToken());

  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => this._token() !== null);

  login(password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.base}/api/auth/login`, { password })
      .pipe(tap((res) => this.setToken(res.token)));
  }

  logout(): void {
    this.setToken(null);
  }

  private setToken(token: string | null): void {
    this._token.set(token);
    if (!this.isBrowser) return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  /** Never runs during SSR — there is no operator session on the server. */
  private readStoredToken(): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(TOKEN_KEY);
  }
}
