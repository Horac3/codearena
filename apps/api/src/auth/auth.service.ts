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
    return this.users.upsertFromGithub({ ...profile, id: String(profile.id) });
  }

  signToken(userId: string, username: string): string {
    return this.jwt.sign({ sub: userId, username });
  }
}
