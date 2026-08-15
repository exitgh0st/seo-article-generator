import { Module } from '@nestjs/common';
import { ArticleValidationService } from './article-validation.service';
import { MarkdownService } from './markdown.service';

@Module({
  providers: [ArticleValidationService, MarkdownService],
  exports: [ArticleValidationService, MarkdownService],
})
export class SeoModule {}
