import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsersService } from '@/user/users.service'; // <--- Import UsersService
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AuthenticatedUser } from '@/auth/interface/authenicated-user.interface';

interface SocketWithAuth extends Socket {
  data: {
    user: AuthenticatedUser;
  };
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class EventGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService, // <--- Inject UsersService
  ) { }

  /**
   * 1. XỬ LÝ KẾT NỐI (AUTHENTICATION)
   * Client phải gửi token khi connect.
   * Ví dụ client: io('...', { auth: { token: '...' } })
   */
  async handleConnection(client: SocketWithAuth) {
    try {
      // Lấy token từ handshake (auth object hoặc headers)
      const token: string | undefined =
        (client.handshake.auth as { token: string })?.token ||
        client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(
          `Client ${client.id} no token provided. Disconnecting...`,
        );
        client.disconnect();
        return;
      }

      // Verify token
      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      if (!secret) {
        this.logger.error('JWT_ACCESS_SECRET is not defined in configuration.');
        client.disconnect();
        return;
      }
      const payload: AuthenticatedUser = await this.jwtService.verifyAsync(
        token,
        { secret },
      );

      // Lưu thông tin user vào socket để dùng sau này
      client.data.user = payload;
      // payload thường chứa: { sub: userId, role: 'admin', branchId: ... }

      this.logger.log(
        `Client connected: ${client.id} | User: ${payload.email} | Role: ${payload.role.name}`,
      );

      // --- LOGIC JOIN PHÒNG CÁ NHÂN ---
      // Lấy userProfileId từ accountId (payload.sub) để join phòng thông báo cá nhân
      const userProfile = await this.usersService.findProfileByAccountId(
        payload.sub,
      );
      if (userProfile) {
        const userRoom = `user_${userProfile.id}`;
        await client.join(userRoom);
        this.logger.log(
          `User ${payload.email} joined personal room ${userRoom}`,
        );
      } else {
        this.logger.warn(
          `Could not find user profile for account ${payload.sub}. Cannot join personal room.`,
        );
      }

      // --- LOGIC PHÂN QUYỀN TỰ ĐỘNG ---
      // Nếu là Admin/Manager/Staff -> Tự động cho vào phòng nhận thông báo hệ thống
      if (['super_admin', 'branch_manager', 'staff'].includes(payload.role.name)) {
        await client.join('admin_notifications');
        this.logger.log(
          `User ${payload.email} joined admin_notifications room`,
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Connection unauthorized: ${errorMessage}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: SocketWithAuth) {
    const userEmail = client.data.user?.email || 'unknown user';
    this.logger.log(`Client disconnected: ${client.id} | User: ${userEmail}`);
  }

  /**
   * 2. JOIN PHÒNG CHAT CỤ THỂ (Cho tính năng Chat 1-1 trong Feedback)
   */
  @SubscribeMessage('join_feedback_room')
  handleJoinRoom(
    @MessageBody() feedbackId: string,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    const user = client.data.user; // Now strongly typed
    if (!user) throw new WsException('Unauthorized');

    // TODO: (Nâng cao) Có thể check xem User này có quyền xem feedbackId này không
    // Nhưng tạm thời check token ở connection là đủ cơ bản.

    void client.join(`feedback_${feedbackId}`);
    this.logger.log(`User ${user.email} joined room feedback_${feedbackId}`);
  }

  @SubscribeMessage('leave_feedback_room')
  handleLeaveRoom(
    @MessageBody() feedbackId: string,
    @ConnectedSocket() client: SocketWithAuth,
  ) {
    void client.leave(`feedback_${feedbackId}`);
  }

  /**
   * 3. CÁC HÀM TIỆN ÍCH (Service gọi)
   */

  // Gửi tin nhắn mới vào phòng chat cụ thể (Dành cho cả User và Admin đang xem ticket đó)
  sendNewMessage(feedbackId: string, payload: any) {
    this.server.to(`feedback_${feedbackId}`).emit('receive_message', payload);
  }

  // Gửi thông báo cho Admin/Manager (Cái chuông đỏ)
  // Gọi hàm này khi User vừa tạo Feedback mới
  notifyAdminsNewFeedback(payload: any) {
    // Gửi cho tất cả những ai trong phòng 'admin_notifications'
    this.server.to('admin_notifications').emit('new_feedback_created', payload);
  }

  // Gửi thông báo real-time cho một người dùng cụ thể
  // Service sẽ gọi hàm này với userProfileId
  sendNotificationToUser(userProfileId: string, payload: any) {
    const userRoom = `user_${userProfileId}`;
    this.server.to(userRoom).emit('new_notification', payload);
  }
}
