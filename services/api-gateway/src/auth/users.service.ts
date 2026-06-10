import { Injectable, BadRequestException } from '@nestjs/common';
import { User } from './interfaces/user.interface';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly users: Map<string, User> = new Map();

  // eslint-disable-next-line @typescript-eslint/require-await
  async findByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async create(email: string, passwordPlain: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email is already taken');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passwordPlain, salt);

    const user: User = {
      id: Math.random().toString(36).substring(2, 15),
      email,
      passwordHash,
    };

    this.users.set(user.id, user);
    return user;
  }
}
