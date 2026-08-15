import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

// The BootstrapContext parameter is required as of Angular 19.2 — without it,
// route extraction during prerendering fails with NG0401 ("No platform exists").
// The CLI scaffold still generates the older signature.
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
