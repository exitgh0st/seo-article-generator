import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResearchService } from './research.service';
import { SaveBriefDto } from './dto/save-brief.dto';

/**
 * Research briefs are never public. They contain unverified claims, working notes,
 * and the full text of fetched pages — none of which belongs on an indexable page.
 * Every route here requires the bearer token via the global JwtAuthGuard.
 */
@ApiTags('Research')
@ApiBearerAuth()
@Controller('research')
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get()
  @ApiOperation({ summary: 'List research briefs, newest first.' })
  list() {
    return this.research.list();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One brief with its source manifest.' })
  findOne(@Param('slug') slug: string) {
    return this.research.findBySlug(slug);
  }

  @Post()
  @ApiOperation({ summary: 'Create or replace a brief and its stored sources.' })
  save(@Body() dto: SaveBriefDto) {
    return this.research.save(dto);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a brief and its sources.' })
  remove(@Param('slug') slug: string) {
    return this.research.remove(slug);
  }
}
