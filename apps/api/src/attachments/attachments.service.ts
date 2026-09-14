import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { ROLE_HIERARCHY, WorkspaceRole } from '../common/enums/workspace-role.enum';
import { ALLOWED_MIME_TYPES } from './attachments.constants';
import { WorkspaceAccessService } from '../common/access/workspace-access.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  private validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed.`);
    }
    const maxBytes = this.configService.get<number>('upload.maxSizeMb')! * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `File exceeds the maximum allowed size of ${this.configService.get<number>('upload.maxSizeMb')}MB.`,
      );
    }
  }

  /** Strips path separators and anything but a conservative charset, keeping the extension. */
  private sanitizeFilename(originalName: string): string {
    const base = originalName.replace(/^.*[\\/]/, '');
    const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return sanitized || 'file';
  }

  async create(userId: string, taskId: string, file: Express.Multer.File) {
    const { membership } = await this.workspaceAccess.requireTaskMembership(
      taskId,
      userId,
    );
    this.workspaceAccess.assertMinRole(
      membership.role as WorkspaceRole,
      WorkspaceRole.MEMBER,
    );
    this.validateFile(file);

    // Unique regardless of original filename, so two uploads named "spec.pdf"
    // never collide on disk.
    const storageKey = `${randomUUID()}-${this.sanitizeFilename(file.originalname)}`;
    await this.storage.upload(file.buffer, storageKey);

    return this.prisma.attachment.create({
      data: {
        taskId,
        uploaderId: userId,
        originalName: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
  }

  async findAll(userId: string, taskId: string) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    return this.prisma.attachment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireAttachment(taskId: string, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment || attachment.taskId !== taskId) {
      throw new NotFoundException('Attachment not found.');
    }
    return attachment;
  }

  async getDownload(userId: string, taskId: string, attachmentId: string) {
    await this.workspaceAccess.requireTaskMembership(taskId, userId);
    const attachment = await this.requireAttachment(taskId, attachmentId);
    return { attachment, stream: this.storage.getStream(attachment.storageKey) };
  }

  async remove(userId: string, taskId: string, attachmentId: string) {
    const { membership } = await this.workspaceAccess.requireTaskMembership(taskId, userId);
    const attachment = await this.requireAttachment(taskId, attachmentId);

    // Uploader can always remove their own file; ADMIN/OWNER can also clean
    // up others' - file cleanup is more operational than the comments'
    // strictly-own-content-only rule, so this is deliberately a bit looser.
    const isUploader = attachment.uploaderId === userId;
    const isAdminOrAbove =
      ROLE_HIERARCHY[membership.role as WorkspaceRole] >=
      ROLE_HIERARCHY[WorkspaceRole.ADMIN];
    if (!isUploader && !isAdminOrAbove) {
      throw new ForbiddenException('You can only delete your own attachments.');
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.storage.delete(attachment.storageKey);
  }
}
