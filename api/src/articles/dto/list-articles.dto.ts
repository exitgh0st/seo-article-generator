import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  type ArticleCategory,
  type ArticleStatus,
} from '../../seo/article.types';

export class ListArticlesDto {
  @ApiPropertyOptional({
    enum: ARTICLE_STATUSES,
    description:
      'Ignored for unauthenticated callers, who always receive published only.',
  })
  @IsOptional()
  @IsIn(ARTICLE_STATUSES as readonly string[])
  status?: ArticleStatus;

  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as readonly string[])
  category?: ArticleCategory;

  @ApiPropertyOptional({ description: 'Substring match on title, slug and description.' })
  @IsOptional()
  @IsString()
  q?: string;
}
