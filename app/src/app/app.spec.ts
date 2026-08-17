import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';
import { API_BASE_URL } from './core/api.config';
import { AuthService } from './core/services/auth.service';

/**
 * The shell renders for signed-out visitors too — /login sits inside it — so the
 * console nav being absent without a session is a rule, not a detail.
 */
describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: '' },
      ],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('names itself as the operator console', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const brand = (fixture.nativeElement as HTMLElement).querySelector('.brand');
    expect(brand?.textContent).toContain('operator console');
  });

  it('hides the console nav when nobody is signed in', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav.nav')).toBeNull();
    expect(compiled.querySelector('.nav-action')).toBeNull();
  });

  it('shows Dashboard, Settings and Sign out to an operator', () => {
    TestBed.inject(AuthService);
    localStorage.setItem('cyberbrief.token', 'a.test.token');

    // The service reads the token once, at construction.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: '' },
      ],
    });

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav.nav a, nav.nav button'),
    ).map((el) => el.textContent?.trim());

    expect(labels).toEqual(['Dashboard', 'Settings', 'Sign out']);
  });
});
