import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'The admin password.' })
  @IsString()
  @MinLength(1)
  password!: string;
}
