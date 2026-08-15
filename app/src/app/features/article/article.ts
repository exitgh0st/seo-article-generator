import { Component, inject, computed, ChangeDetectionStrategy, effect } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, map } from 'rxjs';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { Article } from '../../core/models/article.model';
import { CATEGORY_LABELS } from '../../core/site.config';

@Component({
  selector: 'app-article',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './article.html',
  styleUrl: './article.scss',
})
export class ArticlePage {
  private readonly route = inject(ActivatedRoute);
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly labels = CATEGORY_LABELS;

  /** Resolved by articleResolver before activation, so SEO tags land in the SSR output. */
  protected readonly article = toSignal(
    this.route.data.pipe(map((d) => (d['article'] ?? null) as Article | null)),
    { initialValue: (this.route.snapshot.data['article'] ?? null) as Article | null },
  );

  protected readonly related = toSignal(
    this.route.paramMap.pipe(switchMap((p) => this.content.related(p.get('slug') ?? ''))),
    { initialValue: [] },
  );

  /** Body HTML comes from our own build script rendering our own markdown, so it is trusted. */
  protected readonly body = computed(() => {
    const html = this.article()?.html;
    return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
  });

  protected readonly toc = computed(() => (this.article()?.headings ?? []).filter((h) => h.level === 2));

  protected readonly tier1Count = computed(
    () => this.article()?.sources.filter((s) => s.tier === 1).length ?? 0,
  );

  constructor() {
    effect(() => {
      const article = this.article();
      if (article) this.seo.setArticle(article);
    });
  }
}
