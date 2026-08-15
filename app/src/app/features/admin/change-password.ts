import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';

/** Stated here and in the API's ChangePasswordDto. Change one, change the other. */
const MIN_LENGTH = 12;

/**
 * Change the one password that guards the editor.
 *
 * The confirmation field is not ceremony. There is a single shared credential and
 * no email address to recover it through, so a mistyped new password locks the
 * operator out of their own tool until someone runs `npm run password:reset`
 * against the database.
 *
 * Every check here is repeated on the server, which is the one that counts. These
 * exist so the operator finds out before spending a request.
 */
@Component({
  selector: 'app-change-password',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password.html',
  styleUrl: './admin.scss',
})
export class ChangePassword {
  private readonly auth = inject(AuthService);

  protected readonly minLength = MIN_LENGTH;

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  protected readonly tooShort = computed(
    () => this.newPassword().length > 0 && this.newPassword().length < MIN_LENGTH,
  );

  protected readonly mismatched = computed(
    () =>
      this.confirmPassword().length > 0 &&
      this.newPassword() !== this.confirmPassword(),
  );

  protected readonly unchanged = computed(
    () =>
      this.newPassword().length > 0 &&
      this.newPassword() === this.currentPassword(),
  );

  protected readonly canSubmit = computed(
    () =>
      !this.busy() &&
      !this.done() &&
      this.currentPassword().length > 0 &&
      this.newPassword().length >= MIN_LENGTH &&
      this.newPassword() === this.confirmPassword() &&
      this.newPassword() !== this.currentPassword(),
  );

  protected submit(): void {
    if (!this.canSubmit()) return;

    this.busy.set(true);
    this.error.set(null);

    this.auth
      .changePassword(this.currentPassword(), this.newPassword())
      .subscribe({
        next: () => {
          // The service has already stored the replacement token, so this tab
          // stays signed in. Clear the fields rather than navigating away — the
          // operator should see that it worked.
          this.busy.set(false);
          this.done.set(true);
          this.currentPassword.set('');
          this.newPassword.set('');
          this.confirmPassword.set('');
        },
        error: (err: { status?: number; error?: { message?: string | string[] } }) => {
          this.busy.set(false);
          this.error.set(messageFor(err));
        },
      });
  }

  constructor() {
    inject(SeoService).setPage({
      title: `Change password — ${SITE.name}`,
      description: 'Change the operator password.',
      path: '/admin/password',
      noIndex: true,
    });
  }
}

/**
 * Written out rather than using `apiErrorMessage`, whose 401 branch reads "Your
 * session expired. Sign in again." — wrong on this screen, where a rejection means
 * the current password was mistyped and the session is fine.
 */
function messageFor(err: {
  status?: number;
  error?: { message?: string | string[] };
}): string {
  if (err.status === 400) {
    // The API distinguishes a wrong current password from a rejected new one, and
    // the difference matters to whoever is standing at the form.
    const detail = err.error?.message;
    const text = Array.isArray(detail) ? detail.join(' ') : detail;
    return text ?? 'That change was rejected. Check both fields and try again.';
  }
  if (err.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  return 'Could not reach the API. Is it running on port 3000?';
}
