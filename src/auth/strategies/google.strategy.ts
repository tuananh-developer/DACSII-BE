import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { Inject, Injectable, Logger } from '@nestjs/common';
import googleOauthConfig from '../config/google-oauth.config';
import { ConfigType } from '@nestjs/config';
import { AuthProvider } from '@/user/enum/auth-provider.enum';
import { AuthService } from '../auth.service'; // Import AuthService

/**
 * @class GoogleStrategy
 * @description Triển khai chiến lược xác thực của Passport cho Google OAuth 2.0.
 *
 * Lớp này xử lý luồng xác thực với Google:
 * 1. Chuyển hướng người dùng đến trang đăng nhập của Google.
 * 2. Sau khi người dùng đồng ý, Google chuyển hướng trở lại `callbackURL` với một mã code.
 * 3. Passport-google-oauth20 tự động trao đổi mã code này để lấy `accessToken` và thông tin `profile` của người dùng.
 * 4. Phương thức `validate` được gọi với thông tin đã nhận được.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  /**
   * @constructor
   * @param googleConfiguration - Cấu hình Google OAuth được inject từ `googleOauthConfig`.
   * @param authService - Service xử lý logic tạo hoặc xác thực người dùng trong hệ thống.
   */
  constructor(
    @Inject(googleOauthConfig.KEY)
    private googleConfiguration: ConfigType<typeof googleOauthConfig>,
    private authService: AuthService,
  ) {
    super({
      clientID: googleConfiguration.clientID || '',
      clientSecret: googleConfiguration.clientSecret || '',
      callbackURL: googleConfiguration.callbackURL || '',
      scope: ['email', 'profile'],
    });
    if (
      !googleConfiguration.clientID ||
      !googleConfiguration.clientSecret ||
      !googleConfiguration.callbackURL
    ) {
      this.logger.error('Google OAuth configuration is missing required values!');
      throw new Error(
        'Google OAuth configuration is missing required values (clientID, clientSecret, callbackURL).',
      );
    }
  }

  /**
   * Override authorizationParams để inject thêm parameters vào Google OAuth URL
   * Điều này buộc Google luôn hiển thị account chooser mỗi lần đăng nhập
   */
  authorizationParams(): { [key: string]: string } {
    return {
      prompt: 'select_account', // Buộc Google hiển thị danh sách tài khoản
      access_type: 'offline', // Yêu cầu refresh token
    };
  }

  /**
   * @method validate
   * @description Được Passport tự động gọi sau khi xác thực với Google thành công.
   *
   * Phương thức này nhận thông tin hồ sơ từ Google và sử dụng `AuthService` để
   * tìm hoặc tạo một người dùng tương ứng trong cơ sở dữ liệu của ứng dụng.
   *
   * @param accessToken - Access token do Google cung cấp.
   * @param refreshToken - Refresh token (nếu có).
   * @param profile - Đối tượng chứa thông tin hồ sơ người dùng từ Google (tên, email, ...).
   * @param done - Callback để báo cho Passport biết quá trình xác thực đã hoàn tất.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails } = profile;
    if (!emails || emails.length === 0) {
      return done(new Error('No email found in Google profile'), false);
    }

    const user = {
      email: emails[0].value,
      firstName: name?.givenName, // name might be optional
      lastName: name?.familyName, // name might be optional
    };

    try {
      const userPayload = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      };
      // Gọi service để xử lý logic nghiệp vụ: tìm hoặc tạo người dùng, sử dụng AuthProvider enum
      const validatedUser = await this.authService.validateOAuthLogin(
        userPayload,
        AuthProvider.GOOGLE,
      );
      // Lưu Google access token để revoke sau khi logout
      await this.authService.saveGoogleAccessToken(validatedUser.id, accessToken);
      // Trả về người dùng đã được xác thực, Passport sẽ gắn đối tượng này vào req.user
      done(null, validatedUser);
    } catch (err) {
      done(err, false); // Báo lỗi cho Passport
    }
  }
}
