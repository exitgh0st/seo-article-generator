import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
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
}

export class ChooseAngleDto {
  @ApiProperty({ description: 'Index into the offered angles.', example: 0 })
  @IsInt()
  @Min(0)
  angleIndex!: number;
}
