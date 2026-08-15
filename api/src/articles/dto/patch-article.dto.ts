import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { SaveArticleDto } from './save-article.dto';

/**
 * Surgical edits, which is how .claude/skills/seo-audit/SKILL.md describes the fix
 * step. Full-document rewrites are both expensive and a good way to lose a
 * paragraph that was already correct.
 */
export class PatchArticleDto extends PartialType(
  OmitType(SaveArticleDto, ['slug', 'body'] as const),
) {
  @ApiPropertyOptional({
    description:
      'Exact substring of the current body to replace. Must appear exactly once.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyFind?: string;

  @ApiPropertyOptional({ description: 'Replacement text for bodyFind.' })
  @IsOptional()
  @IsString()
  bodyReplace?: string;

  @ApiPropertyOptional({
    description: 'Replace the entire body. Mutually exclusive with bodyFind.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;
}

export class SetStatusDto {
  @ApiProperty({ enum: ['draft', 'review'] })
  @IsString()
  status!: 'draft' | 'review';
}
