import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { SeoModule } from '../seo/seo.module';
import { ResearchModule } from '../research/research.module';
import { AuthModule } from '../auth/auth.module';
import { OptionalJwtMiddleware } from '../auth/optional-jwt.middleware';

@Module({
  imports: [SeoModule, ResearchModule, AuthModule],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Only the two @Public() read routes. Everything else is covered by the
    // global JwtAuthGuard, which sets request.user itself.
    consumer
      .apply(OptionalJwtMiddleware)
      .forRoutes(
        { path: 'articles', method: RequestMethod.GET },
        { path: 'articles/:slug', method: RequestMethod.GET },
      );
  }
}
