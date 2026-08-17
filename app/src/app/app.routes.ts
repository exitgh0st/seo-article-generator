import { Routes } from '@angular/router';
import { articleResolver } from './core/resolvers/article.resolver';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'article/:slug',
    loadComponent: () => import('./features/article/article').then((m) => m.ArticlePage),
    resolve: { article: articleResolver },
  },
  {
    path: 'category/:category',
    loadComponent: () => import('./features/listing/listing').then((m) => m.Listing),
    data: { mode: 'category' },
  },
  {
    path: 'tag/:tag',
    loadComponent: () => import('./features/listing/listing').then((m) => m.Listing),
    data: { mode: 'tag' },
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/admin-list').then((m) => m.AdminList),
  },
  {
    // Listed before admin/:slug so "new", "runs" and "settings" are not read as slugs.
    path: 'admin/new',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/new-article').then((m) => m.NewArticle),
  },
  {
    path: 'admin/settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/settings').then((m) => m.Settings),
  },
  {
    // The password form moved into settings. DEPLOYMENT.md sends the operator
    // here by name, so the old address has to keep arriving somewhere.
    path: 'admin/password',
    redirectTo: 'admin/settings',
    pathMatch: 'full',
  },
  {
    path: 'admin/runs/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/run-detail').then((m) => m.RunDetail),
  },
  {
    path: 'admin/:slug/publish',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/publish-article').then((m) => m.PublishArticle),
  },
  {
    path: 'admin/:slug',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/admin-detail').then((m) => m.AdminDetail),
    resolve: { article: articleResolver },
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];
