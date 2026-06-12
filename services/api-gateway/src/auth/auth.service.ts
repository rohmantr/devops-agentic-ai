import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    // Note: Temporary hardcoded check until database is implemented
    if (dto.email === 'test@example.com' && dto.password === 'Test1234!') {
      const payload = { sub: 'user_123', email: dto.email };
      return { access_token: await this.jwtService.signAsync(payload) };
    }
    throw new UnauthorizedException();
  }
}
