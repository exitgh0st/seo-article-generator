import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  type ArticleCategory,
  type ArticleStatus,
} from '../../seo/article.types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuthorDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;
}

export class HeroImageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  src!: string;

  /** Required whenever src is set — enforced again in ArticleValidationService. */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  alt!: string;
}

export class SourceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^https?:\/\//i, { message: 'source url must be http(s)' })
  url!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  publisher!: string;

  @ApiProperty({ enum: [1, 2, 3], description: 'See docs/sources.md.' })
  @IsInt()
  @Min(1)
  @Max(3)
  tier!: 1 | 2 | 3;

  @ApiProperty({ example: '2026-08-12' })
  @Matches(DATE, { message: 'accessedAt must be YYYY-MM-DD' })
  accessedAt!: string;
}

/**
 * A complete article. The generation pipeline, the importer and the admin UI all
 * go through this shape, so no two of them can diverge.
 */
export class SaveArticleDto {
  @ApiProperty({ description: '≤60 chars, primary keyword in the first five words.' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ description: 'The on-page H1. Falls back to title.' })
  @IsOptional()
  @IsString()
  headline?: string;

  @ApiProperty({ description: '3–6 lowercase hyphenated words, no dates.' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by single hyphens',
  })
  slug!: string;

  @ApiProperty({ description: '150–160 chars, contains the primary keyword.' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  primaryKeyword!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  secondaryKeywords!: string[];

  @ApiProperty({ enum: ARTICLE_CATEGORIES })
  @IsIn(ARTICLE_CATEGORIES as readonly string[])
  category!: ArticleCategory;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  tags!: string[];

  @ApiProperty({ type: AuthorDto })
  @ValidateNested()
  @Type(() => AuthorDto)
  author!: AuthorDto;

  @ApiPropertyOptional({ description: 'Set once at first publication; never reset.' })
  @IsOptional()
  @Matches(DATE, { message: 'publishedAt must be YYYY-MM-DD' })
  publishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE, { message: 'updatedAt must be YYYY-MM-DD' })
  updatedAt?: string;

  @ApiPropertyOptional({ enum: ARTICLE_STATUSES })
  @IsOptional()
  @IsIn(ARTICLE_STATUSES as readonly string[])
  status?: ArticleStatus;

  @ApiPropertyOptional({ type: HeroImageDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroImageDto)
  heroImage?: HeroImageDto;

  @ApiPropertyOptional({ type: [String], description: 'Uppercase CVE-YYYY-NNNNN.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cves?: string[];

  @ApiProperty({ type: [SourceDto], description: 'Minimum three.' })
  @IsArray()
  @ArrayMinSize(3, { message: 'sources: minimum 3' })
  @ValidateNested({ each: true })
  @Type(() => SourceDto)
  sources!: SourceDto[];

  @ApiPropertyOptional({ description: 'Only when syndicated from elsewhere.' })
  @IsOptional()
  @IsString()
  canonical?: string;

  @ApiProperty({ description: 'Markdown body, starting at H2. No frontmatter, no H1.' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({ description: 'Research brief this article was written from.' })
  @IsOptional()
  @IsString()
  briefId?: string;
}
