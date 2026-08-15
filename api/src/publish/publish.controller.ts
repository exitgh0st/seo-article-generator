import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublishService } from './publish.service';

@ApiTags('Publish')
@ApiBearerAuth()
@Controller('articles/:slug')
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  @Get('preflight')
  @ApiOperation({
    summary: 'Run every publication check without changing anything.',
  })
  preflight(@Param('slug') slug: string) {
    return this.publish.preflight(slug);
  }

  @Post('publish')
  @ApiOperation({
    summary: 'Publish, and export the markdown to content/articles/.',
  })
  publishArticle(@Param('slug') slug: string) {
    return this.publish.publish(slug);
  }

  @Post('unpublish')
  @ApiOperation({ summary: 'Return a published article to review status.' })
  unpublish(@Param('slug') slug: string) {
    return this.publish.unpublish(slug);
  }
}
