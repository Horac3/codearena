import { Module, Global } from '@nestjs/common';
import { Judge0LanguageService } from './judge0-language.service';

@Global()
@Module({
  providers: [Judge0LanguageService],
  exports: [Judge0LanguageService],
})
export class Judge0Module {}
