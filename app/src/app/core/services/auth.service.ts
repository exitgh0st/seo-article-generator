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

/** What `GET /api/auth/me` says about the session this tab is holding. */
export interface SessionInfo {
  userId: string;
  /** ISO date. Every other session was ended at this moment. */
  passwordChangedAt: string;
  /** Unix seconds, from the token's own `exp` claim. */
  expiresAt: number | null;
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

  /**
   * Changing the password invalidates every token the API has issued, including
   * the one in this tab. The response carries a replacement, so storing it here
   * is what keeps the operator who made the change signed in.
   */
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.base}/api/auth/password`, {
        currentPassword,
        newPassword,
      })
      .pipe(tap((res) => this.setToken(res.token)));
  }

  /**
   * Describes the current session. Read-only, and the settings screen is the
   * only caller — the guard trusts the stored token rather than spending a
   * request to confirm it on every navigation.
   */
  session(): Observable<SessionInfo> {
    return this.http.get<SessionInfo>(`${this.base}/api/auth/me`);
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
