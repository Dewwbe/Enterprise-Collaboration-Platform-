import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's notifications",
    description: 'Supports ?unreadOnly=&page=&limit=',
  })
  findAll(@CurrentUser('userId') userId: string, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.findAllForUser(userId, query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of the caller\'s own notifications as read' })
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(userId, id);
  }
}
