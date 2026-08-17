import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ARTICLE_CATEGORIES } from '../../seo/article.types';

export class StartRunDto {
  @ApiProperty({
    description: 'What the article is about, in the operator\'s own words.',
    example: 'N-able N-central authentication bypass being exploited',
  })
  @IsString()
  @MinLength(8, {
    message:
      'Say a little more about the topic — a vendor and a product, or a CVE identifier.',
  })
  @MaxLength(300)
  topic!: string;

  @ApiPropertyOptional({
    description:
      'The search query to target. Left blank, the chosen angle supplies one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  primaryKeyword?: string;

  @ApiProperty({ enum: ARTICLE_CATEGORIES })
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category!: string;

  @ApiPropertyOptional({
    description:
      'Take the strongest angle and keep going rather than stopping to ask. ' +
      'Defaults to true — the run is meant to reach review unattended.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  autoAngle?: boolean;
}

/**
 * Judge a topic before spending anything on it.
 *
 * Same two fields the run takes, minus the keyword: this is about whether the
 * story is sourceable, and the keyword has no bearing on that.
 */
export class PreflightTopicDto {
  @ApiProperty({ example: 'N-able N-central authentication bypass being exploited' })
  @IsString()
  @MinLength(8, {
    message:
      'Say a little more about the topic — a vendor and a product, or a CVE identifier.',
  })
  @MaxLength(300)
  topic!: string;

  @ApiPropertyOptional({ enum: ARTICLE_CATEGORIES })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category?: string;
}

/**
 * One optional field, and no free-text hint.
 *
 * The button exists precisely because the operator has nothing to type. A hint
 * box re-creates the topic field it was meant to replace, and an operator who
 * knows enough to write one should press Start instead.
 */
export class SuggestTopicsDto {
  @ApiPropertyOptional({
    enum: ARTICLE_CATEGORIES,
    description:
      'Narrows the search to one beat. Left blank, the search spans all of them.',
  })
  @IsOptional()
  @IsIn(ARTICLE_CATEGORIES as unknown as string[])
  category?: string;
}

export class ChooseAngleDto {
  @ApiProperty({ description: 'Index into the offered angles.', example: 0 })
  @IsInt()
  @Min(0)
  angleIndex!: number;
}
