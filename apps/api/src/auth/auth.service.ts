// apps/api/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  async validateGithubUser(profile: {
    id: string;
    username: string;
    avatarUrl: string;
    email?: string;
  }) {
    let user = await this.users.findByGithubId(profile.id);
    if (!user) {
      user = await this.users.create(profile);
    }
    return user;
  }

  signToken(userId: string, username: string): string {
    return this.jwt.sign({ sub: userId, username });
  }
}
