import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected submit(): void {
    if (this.busy() || !this.password()) return;

    this.busy.set(true);
    this.error.set(null);

    this.auth.login(this.password()).subscribe({
      next: () => {
        const redirectTo =
          this.route.snapshot.queryParamMap.get('redirectTo') ?? '/admin';
        void this.router.navigateByUrl(redirectTo);
      },
      error: (err: { status?: number }) => {
        this.busy.set(false);
        this.password.set('');
        this.error.set(
          err.status === 401
            ? 'Incorrect password.'
            : err.status === 429
              ? 'Too many attempts. Wait a minute and try again.'
              : 'Could not reach the API. Is it running on port 3000?',
        );
      },
    });
  }

  constructor() {
    inject(SeoService).setPage({
      title: `Sign in — ${SITE.name}`,
      description: 'Operator sign-in.',
      path: '/login',
      noIndex: true,
    });
  }
}
