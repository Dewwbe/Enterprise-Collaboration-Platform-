import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * Pushes newly-created notifications to connected clients in real time.
 * Auth happens at the handshake (client sends its access token as
 * `auth: { token }`, same JWT used for HTTP), not per-message - once a socket
 * is authenticated its userId is fixed for the life of the connection.
 *
 * Known limitation: the userId -> sockets map below is in-memory, so this
 * only fans out to clients connected to *this* process. Scaling to multiple
 * API instances would need a shared adapter (e.g. Redis) - out of scope here.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true }, namespace: 'notifications' })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly socketsByUserId = new Map<string, Set<Socket>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        throw new Error('Missing auth token');
      }
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      const userId = payload.sub;
      client.data.userId = userId;
      if (!this.socketsByUserId.has(userId)) {
        this.socketsByUserId.set(userId, new Set());
      }
      this.socketsByUserId.get(userId)!.add(client);
    } catch (error) {
      this.logger.warn(`Rejecting unauthenticated socket: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data.userId;
    if (!userId) {
      return;
    }
    const sockets = this.socketsByUserId.get(userId);
    sockets?.delete(client);
    if (sockets && sockets.size === 0) {
      this.socketsByUserId.delete(userId);
    }
  }

  /** Pushes a notification payload to every socket the user currently has open. */
  pushToUser(userId: string, notification: unknown) {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets || sockets.size === 0) {
      return;
    }
    for (const socket of sockets) {
      socket.emit('notification', notification);
    }
  }
}
