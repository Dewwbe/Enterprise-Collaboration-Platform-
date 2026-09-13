import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';
import { TaskStatus } from '../../common/enums/task-status.enum';

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['assigneeId'] as const),
) {
  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Must be a legal forward transition from the current status.',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Pass null to unassign the task.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;
}
