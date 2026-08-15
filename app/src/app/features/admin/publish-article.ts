import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminApiService, apiErrorMessage } from '../../core/services/admin-api.service';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';
import type { PreflightReport } from '../../core/models/generation.model';

/**
 * The publish gate.
 *
 * Publishing is the one action here that reaches the public and cannot really be
 * taken back, so it is a screen rather than a button in a list: the checks that
 * had to pass are shown, every source URL is re-fetched live and listed, and the
 * button stays disabled until the server says it is ready.
 *
 * The preflight runs server-side and runs again inside `publish`, so this screen
 * cannot talk anything into going out — it only shows what the server decided.
 */
@Component({
  selector: 'app-publish-article',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './publish-article.html',
  styleUrl: './admin.scss',
})
export class PublishArticle {
  private readonly api = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);

  protected readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';

  protected readonly report = signal<PreflightReport | null>(null);
  protected readonly busy = signal(false);
  protected readonly checking = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly published = signal(false);

  protected readonly canPublish = computed(
    () => this.report()?.ok === true && !this.busy() && !this.published(),
  );

  constructor() {
    inject(SeoService).setPage({
      title: `Publish — ${SITE.name}`,
      description: 'Publish an article.',
      path: `/admin/${this.slug}/publish`,
      noIndex: true,
    });

    this.check();
  }

  protected check(): void {
    this.checking.set(true);
    this.error.set(null);
    this.api.preflight(this.slug).subscribe({
      next: (report) => {
        this.report.set(report);
        this.checking.set(false);
      },
      error: (err) => {
        this.checking.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected publish(): void {
    if (!this.canPublish()) return;

    this.busy.set(true);
    this.error.set(null);
    this.api.publish(this.slug).subscribe({
      next: () => {
        this.busy.set(false);
        this.published.set(true);
        // The article is now public; every cached list is stale.
        this.content.refresh();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
        // A refusal here means the article changed since the check, so show why.
        this.check();
      },
    });
  }

  protected viewPublic(): void {
    void this.router.navigate(['/article', this.slug]);
  }
}
