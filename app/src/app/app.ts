import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ARTICLE_CATEGORIES } from './core/models/article.model';
import { CATEGORY_LABELS, SITE } from './core/site.config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly site = SITE;
  protected readonly categories = ARTICLE_CATEGORIES;
  protected readonly labels = CATEGORY_LABELS;
  protected readonly year = new Date().getFullYear();
}
