import { Module } from '@nestjs/common';
import { WebFetchService } from './web-fetch.service';
import { WebSearchService } from './web-search.service';

/**
 * Outbound network access, kept in one place because all of it is either a
 * server-side request forgery surface or a paid API.
 *
 * `WebSearchService` ranks candidate sources for the research stage;
 * `WebFetchService` retrieves and extracts them, and is also what the publish
 * preflight uses to confirm every source URL in an article still resolves.
 */
@Module({
  providers: [WebFetchService, WebSearchService],
  exports: [WebFetchService, WebSearchService],
})
export class ToolsModule {}
