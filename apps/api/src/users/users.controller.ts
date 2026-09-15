import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the caller's own profile" })
  me(@CurrentUser('userId') userId: string) {
    return this.usersService.findById(userId);
  }

  @Get('me/dashboard')
  @ApiOperation({
    summary: "Get the caller's personal dashboard",
    description:
      'Workspace/project counts, assigned-task counts by status, overdue tasks, and recent tasks. Cached for 60s.',
  })
  dashboard(@CurrentUser('userId') userId: string) {
    return this.usersService.getDashboard(userId);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Look up a user by email (for inviting to org/workspace)' })
  lookup(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user profile by id' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
