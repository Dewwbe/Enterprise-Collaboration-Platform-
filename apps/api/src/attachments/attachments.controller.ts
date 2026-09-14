import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuditLog } from '../common/decorators/audit-log.decorator';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @AuditLog('attachment.create', 'Attachment')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload a file attachment to a task (MEMBER or above)',
    description: 'Size and MIME type are validated server-side; see UPLOAD_MAX_SIZE_MB.',
  })
  create(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachmentsService.create(userId, taskId, file);
  }

  @Get()
  @ApiOperation({ summary: 'List attachments on a task' })
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.attachmentsService.findAll(userId, taskId);
  }

  @Get(':attachmentId/download')
  @ApiOperation({ summary: 'Download an attachment' })
  async download(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ) {
    const { attachment, stream } = await this.attachmentsService.getDownload(
      userId,
      taskId,
      attachmentId,
    );
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${attachment.originalName}"`,
      'Content-Length': attachment.sizeBytes,
    });
    stream.pipe(res);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditLog('attachment.delete', 'Attachment', 'attachmentId')
  @ApiOperation({ summary: 'Delete an attachment (uploader, or ADMIN/OWNER)' })
  remove(
    @CurrentUser('userId') userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachmentsService.remove(userId, taskId, attachmentId);
  }
}
