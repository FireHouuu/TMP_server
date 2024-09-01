import { IsString, IsEmail } from 'class-validator';

export class CreateUserDto {
  @IsString()
  uid: string;

  @IsEmail()
  email: string;

  @IsString()
  name: string;
}
