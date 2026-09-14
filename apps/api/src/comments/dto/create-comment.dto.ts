import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Looks good, one small nit on the naming.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;
}
