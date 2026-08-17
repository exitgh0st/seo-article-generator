import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { SITE } from './core/site.config';
import { environment } from '../environments/environment';

/**
 * The console shell.
 *
 * The header used to carry the six article categories, which is a reader's way
 * into a publication — and nobody reads this app. It is the operator's tool, so
 * the nav names the two places an operator goes and the way out. The public
 * routes are still routed: the review screen links to /article/:slug to show
 * what a piece will look like, and that page links its tags.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Public because the template asks it whether to render the nav at all. */
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();

  /**
   * The feeds live at the API's root, not this app's. There is no proxy in front
   * of a static build, so the links have to name that origin.
   */
  protected readonly feedBase = environment.apiUrl;

  protected signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
