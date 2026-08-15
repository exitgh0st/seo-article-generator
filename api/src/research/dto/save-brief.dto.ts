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
import { BRIEF_STATUSES, type BriefStatus } from '../../seo/article.types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ResearchSourceDto {
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

  /**
   * The page's extracted text, as fetched. **The caller must send this.**
   *
   * It is the substrate the grounding gate checks CVE identifiers and indicators
   * of compromise against. Omit it and nothing downstream fails — the check
   * passes vacuously, reporting that it could verify nothing — so an article
   * built on a brief saved without it is unverified by construction.
   *
   * Two callers supply it: the research stage, from its own fetch, and
   * `import-content.ts`, from the `<brief>.sources/` sidecar on disk.
   */
  rawContent?: string;
}

export class SaveBriefDto {
  @ApiProperty({ description: '<YYYY-MM-DD>-<topic-slug>' })
  @Matches(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'brief slug must be <YYYY-MM-DD>-<topic-slug>',
  })
  slug!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  topic!: string;

  @ApiPropertyOptional({ example: '2026-08-12' })
  @IsOptional()
  @Matches(DATE, { message: 'researchedAt must be YYYY-MM-DD' })
  researchedAt?: string;

  @ApiPropertyOptional({ enum: BRIEF_STATUSES })
  @IsOptional()
  @IsIn(BRIEF_STATUSES as readonly string[])
  status?: BriefStatus;

  @ApiProperty({
    description:
      'The brief itself, in the template from .claude/skills/research/SKILL.md.',
  })
  @IsString()
  @MinLength(1)
  markdown!: string;

  @ApiProperty({
    type: [ResearchSourceDto],
    description: 'Minimum three independent sources, per CLAUDE.md.',
  })
  @IsArray()
  @ArrayMinSize(3, { message: 'sources: minimum 3 independent sources' })
  @ValidateNested({ each: true })
  @Type(() => ResearchSourceDto)
  sources!: ResearchSourceDto[];
}
