import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './user.dto';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('signup')
  @UseGuards(FirebaseAuthGuard)
  async signUp(@Body() createUserDto: CreateUserDto, @Req() req) {
    createUserDto.uid = req.user.uid;
    createUserDto.email = req.user.email;

    const existingUser = await this.userService.findUserByUid(req.user.uid);
    if (existingUser) {
      return { message: `환영합니다 ${existingUser.name}님!`, user: existingUser };
    }

    const newUser = await this.userService.createUser(createUserDto);
    return { message: `반갑습니다 ${newUser.name}님!`, user: newUser };
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  async getProfile(@Req() req) {
    if (!req.user) {
      console.log('User not found in request');
    }
    return this.userService.findUserByUid(req.user.uid);
  }
}
