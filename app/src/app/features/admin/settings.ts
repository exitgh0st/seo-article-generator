import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ChangePassword } from './change-password';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { AdminApiService, type HealthReport } from '../../core/services/admin-api.service';
import type { SessionInfo } from '../../core/services/auth.service';
import { SITE } from '../../core/site.config';

/**
 * Everything about the operator rather than the articles.
 *
 * Only one thing here is writable, because only one thing is: the password. The
 * rest is read-back — what the API says about this session and about itself —
 * and it is here so that "is the API even up?" has an answer inside the app
 * instead of in a terminal.
 *
 * Both reads are allowed to fail quietly. The password form is the reason to
 * open this page, and it must render whether or not the panels beside it do.
 */
@Component({
  selector: 'app-settings',
  imports: [ChangePassword, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.html',
  styleUrl: './admin.scss',
})
export class Settings {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AdminApiService);

  protected readonly site = SITE;

  protected readonly session = toSignal<SessionInfo | null>(
    this.auth.session().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly health = toSignal<HealthReport | null>(
    this.api.health().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  /** The `exp` claim is Unix seconds; DatePipe wants milliseconds. */
  protected readonly expiresAt = computed(() => {
    const seconds = this.session()?.expiresAt;
    return seconds ? new Date(seconds * 1000) : null;
  });

  protected readonly uptime = computed(() => {
    const seconds = this.health()?.uptime;
    if (seconds === undefined) return null;

    const hours = Math.floor(seconds / 3600);
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours >= 1) return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 60)}m`;
  });

  constructor() {
    inject(SeoService).setPage({
      title: `Settings — ${SITE.name}`,
      description: 'Operator settings.',
      path: '/admin/settings',
      noIndex: true,
    });
  }
}
