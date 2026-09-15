import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'dewmini@example.com' })
  @IsEmail({}, { message: 'A valid email address is required.' })
  email: string;
}
