import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { SITE } from '../../core/site.config';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="page-head">
        <h1>Page not found</h1>
        <p>That article doesn't exist, or it hasn't been published yet.</p>
      </header>
      <p><a routerLink="/">Back to the latest articles</a></p>
    </div>
  `,
})
export class NotFound {
  constructor() {
    inject(SeoService).setPage({
      title: `Page not found — ${SITE.name}`,
      description: 'That page does not exist.',
      path: '/404',
      noIndex: true,
    });
  }
}
