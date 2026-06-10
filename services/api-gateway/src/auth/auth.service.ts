import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';
import * as bcrypt from 'bcrypt';
import { User } from './interfaces/user.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    email: string,
    passwordPlain: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.usersService.create(email, passwordPlain);
    const { id, email: userEmail } = user;
    return { id, email: userEmail };
  }

  async validateUser(
    email: string,
    passwordPlain: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(passwordPlain, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { id, email: userEmail } = user;
    return { id, email: userEmail };
  }

  login(user: Omit<User, 'passwordHash'>) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
