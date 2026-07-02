import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

import { User } from './decorator/users.decorator';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { LoginCompleteDto } from './dto/login-complete.dto';
import { AuthenticatedRequest } from './interface/authenticated-request.interface';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from './interface/authenicated-user.interface';
import { AuthMessageResponseDto } from './dto/auth-message-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { TokenResponseDto } from './dto/token-response.dto';

/**
 * @controller AuthController
 * @description Xử lý các yêu cầu liên quan đến xác thực người dùng,
 * bao gồm đăng ký, đăng nhập, đăng xuất, xác thực qua Google và làm mới token.
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(
    private readonly authService: AuthService,
    /**
     * @param {AuthService} authService - Service xử lý logic nghiệp vụ xác thực.
     * @param {ConfigService} configService - Service để truy cập các biến môi trường cấu hình.
     */
    private readonly configService: ConfigService,
  ) { }

  /**
   * @route POST /auth/register/initiate
   * @description Bắt đầu quá trình đăng ký. Nhận thông tin người dùng và gửi email xác thực.
   * @param {RegisterUserDto} registerDto - DTO chứa thông tin đăng ký của người dùng.
   * @returns {Promise<AuthMessageResponseDto>} - Thông báo về việc đã gửi email xác thực.
   */
  @Post('register/initiate')
  @ApiOperation({ summary: 'Bắt đầu quá trình đăng ký' })
  @ApiResponse({ status: 200, type: AuthMessageResponseDto, description: 'Gửi mã xác thực thành công.' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ (Validation Error).',
  })
  @ApiResponse({
    status: 409,
    description: 'Email đã được sử dụng bởi một tài khoản đã xác thực.',
  })
  @ApiBody({ type: RegisterUserDto })
  @HttpCode(HttpStatus.OK)
  initiateRegistration(@Body() registerDto: RegisterUserDto): Promise<AuthMessageResponseDto> {
    this.logger.log(`Registration initiated for ${registerDto.email}`);
    return this.authService.initiateRegistration(registerDto);
  }

  /**
   * @route POST /auth/register/complete
   * @description Hoàn tất quá trình đăng ký bằng cách xác thực mã được gửi qua email. Sau khi xác thực thành công, hệ thống sẽ tự động đăng nhập người dùng.
   * @param {VerifyEmailDto} verifyEmailDto - DTO chứa email và mã xác thực.
   * @param {Response} res - Đối tượng response để set cookie.
   * @returns {Promise<LoginResponseDto>} - Thông tin đăng nhập bao gồm access token và user info.
   */
  @Post('register/complete')
  @ApiOperation({ summary: 'Hoàn thành đăng ký và tự động đăng nhập' })
  @ApiResponse({ status: 200, type: LoginResponseDto, description: 'Xác thực và đăng nhập thành công.' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ (Validation Error).',
  })
  @ApiResponse({ status: 409, description: 'Mã không hợp lệ hoặc đã hết hạn.' })
  @HttpCode(HttpStatus.OK)
  async completeRegistration(
    @Body() verifyEmailDto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponseDto> {
    this.logger.log(`Completing registration for ${verifyEmailDto.email}`);
    const loginData = await this.authService.completeRegistration(
      verifyEmailDto.email,
      verifyEmailDto.verificationCode,
    );

    res.cookie('refresh_token', loginData.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      path: '/',
    })

    return {
      accessToken: loginData.accessToken,
      user: loginData.user
    }
  }

  /**
   * @route GET /auth/google
   * @description Bắt đầu luồng xác thực với Google.
   * `GoogleAuthGuard` sẽ tự động chuyển hướng người dùng đến trang đăng nhập của Google.
   * @param {Request} _req - Đối tượng request (không được sử dụng trực tiếp).
   */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Bắt đầu đăng nhập với Google' })
  @ApiResponse({
    status: 302,
    description: 'Chuyển hướng đến trang đăng nhập của Google.',
  })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  googleAuth(@Req() _req: Request) {
    this.logger.log('Initiating Google authentication');
    // Guard sẽ tự động chuyển hướng, không cần code trong hàm này.
  }

  /**
   * @route GET /auth/google/callback
   * @description Callback URL cho luồng xác thực Google. `GoogleAuthGuard` xử lý và trả về thông tin người dùng.
   * Sau khi xác thực thành công, phương thức này sẽ:
   * 1. Tạo access token và refresh token.
   * 2. Set refresh token vào một httpOnly cookie.
   * 3. Trả về một đoạn mã HTML/JavaScript để gửi access token và thông tin người dùng về cho cửa sổ cha (ứng dụng frontend) và sau đó tự đóng cửa sổ popup.
   * @param {AuthenticatedUser} user - Thông tin người dùng lấy được từ Google.
   * @param {Response} res - Đối tượng response của Express để gửi script về cho client.
   */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Callback xử lý sau khi đăng nhập Google thành công',
  })
  @ApiResponse({
    status: 200,
    description:
      'Xác thực thành công. Trả về một script để gửi token cho cửa sổ cha và đóng popup. Refresh token được gửi qua cookie.',
  })
  @ApiResponse({
    status: 500,
    description: 'Lỗi cấu hình phía server (ví dụ: thiếu FRONTEND_URL_WEB hoặc FRONTEND_URL_MOBILE).',
  })
  async googleAuthRedirect(
    @User() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    this.logger.log(`Google callback successful for user ${user.email}`);
    const loginData = await this.authService.login(user);

    const platform = (req.query.platform as string) || 'web';
    this.logger.log(`Google callback platform: ${platform}`);

    if (platform === 'mobile') {
      // Nếu là mobile, thay vì trả về script, chúng ta sẽ trả về JSON chứa access token và thông tin user. Refresh token vẫn được gửi qua cookie.
      const mobileDeeplink = this.configService.get<string>('MOBILE_DEEPLINK_URL');
      if (!mobileDeeplink) {
        throw new InternalServerErrorException('Lỗi cấu hình MOBILE_DEEPLINK_URL');
      }
      const deepLink = `${mobileDeeplink}?accessToken=${loginData.accessToken}&refreshToken=${loginData.refreshToken}`;
      return res.redirect(deepLink);
    }

    const frontendURL = this.configService.get<string>('FRONTEND_URL_WEB');
    if (!frontendURL) {
      throw new InternalServerErrorException('Lỗi cấu hình FRONTEND_URL_WEB');
    }

    // 1. Gửi refresh token về client qua httpOnly cookie để bảo mật
    res.cookie('refresh_token', loginData.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      path: '/',
    });

    // 2. Gửi access token và thông tin user về cho frontend qua postMessage
    const script = `
    <script>
      try {
        const payload = ${JSON.stringify({
      accessToken: loginData.accessToken,
      user: loginData.user,
    })};
        const targetOrigin = new URL('${frontendURL}').origin;

        if (window.opener) {
          console.log('Auth Callback: Attempting to post message to target origin:', targetOrigin);
          console.log('Auth Callback: Payload:', payload);
          window.opener.postMessage(payload, targetOrigin);
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          console.error('Auth Callback Error: window.opener is not available. This happens if the login page was not opened as a popup. Cannot send token.');
          document.body.innerHTML = "<h1>Login Error</h1><p>Could not communicate with the main application window. Please ensure this page is opened as a popup.</p>";
        }
      } catch (e) {
        console.error('Auth Callback Script Error:', e);
        document.body.innerHTML = '<h1>An unexpected error occurred</h1><p>Please check the console for details and verify your FRONTEND_URL_WEB configuration.</p><pre>' + e.toString() + '</pre>';
      }
    </script>
    `;

    // 3. Trả về script để thực thi ở trình duyệt của client
    res.send(script);
  }

  /**
   * @route POST /auth/refresh
   * @description Làm mới access token bằng cách sử dụng refresh token được lưu trong cookie.
   */
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token bằng refresh token' })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({ status: 200, type: TokenResponseDto, description: 'Trả về access token mới.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Refresh token không hợp lệ hoặc đã hết hạn.',
  })
  refreshTokens(@Req() req: AuthenticatedRequest): Promise<TokenResponseDto> {
    const userId = req.user.sub;
    this.logger.log(`Refreshing tokens for user ${userId}`);
    return this.authService.refreshTokens(userId);
  }

  /**
   * @route POST /auth/logout
   * @description Đăng xuất người dùng. Vô hiệu hóa refresh token trong CSDL và xóa cookie phía client.
   * @param {AuthenticatedRequest} req - Request đã được xác thực bởi `JwtAuthGuard`.
   * @param {Response} res - Đối tượng response của Express để xóa cookie.
   * @returns {Promise<AuthMessageResponseDto>} - Thông báo đăng xuất thành công.
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất người dùng' })
  @ApiCookieAuth()
  @ApiResponse({ status: 200, type: AuthMessageResponseDto, description: 'Đăng xuất thành công.' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Access token không hợp lệ.',
  })
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthMessageResponseDto> {
    const userId = req.user.sub;
    this.logger.log(`User ${userId} logging out`);
    await this.authService.logout(userId);

    // Clear tất cả cookies liên quan đến auth
    res.clearCookie('refresh_token', { path: '/' });
    res.clearCookie('access_token', { path: '/' });

    return { message: 'Đăng xuất thành công' };
  }

  /**
   * @route POST /auth/forgot-password
   * @description Bắt đầu quá trình quên mật khẩu. Gửi email chứa link đặt lại mật khẩu cho người dùng.
   * @param {ForgotPasswordDto} forgotPasswordDto - DTO chứa email của người dùng.
   * @returns {Promise<AuthMessageResponseDto>} - Một thông báo chung để bảo mật.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi yêu cầu đặt lại mật khẩu' })
  @ApiResponse({
    status: 200,
    type: AuthMessageResponseDto,
    description: 'Luôn trả về thông báo thành công để tránh dò email.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto): Promise<AuthMessageResponseDto> {
    this.logger.log(
      `Forgot password requested for email ${forgotPasswordDto.email}`,
    );
    return this.authService.forgotPassword(
      forgotPasswordDto.email,
      forgotPasswordDto.returnUrl,
    );
  }

  /**
   * @route POST /auth/reset-password
   * @description Đặt lại mật khẩu bằng token đã nhận được qua email.
   * @param {ResetPasswordDto} resetPasswordDto - DTO chứa token và mật khẩu mới.
   * @returns {Promise<AuthMessageResponseDto>} - Thông báo cập nhật mật khẩu thành công.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu với token' })
  @ApiResponse({
    status: 200,
    type: AuthMessageResponseDto,
    description: 'Mật khẩu đã được cập nhật thành công.',
  })
  @ApiResponse({
    status: 400,
    description: 'Token không hợp lệ hoặc đã hết hạn.',
  })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<AuthMessageResponseDto> {
    this.logger.log('Resetting password');
    return this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.newPassword,
    );
  }

  /**
   * @route POST /auth/login/initiate
   * @description Bước 1 của quá trình đăng nhập bằng email/mật khẩu.
   * Xác thực thông tin đăng nhập và gửi mã xác thực (OTP) qua email nếu thành công.
   * @param {LoginUserDto} loginUserDto - DTO chứa email và mật khẩu.
   * @returns {Promise<AuthMessageResponseDto>} - Thông báo về việc đã gửi mã xác thực.
   */
  @Post('login/initiate')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'B1 Đăng nhập: Xác thực mật khẩu, gửi mã về email' })
  @ApiResponse({ status: 200, type: AuthMessageResponseDto, description: 'Gửi mã xác thực thành công.' })
  @ApiResponse({
    status: 401,
    description: 'Email hoặc mật khẩu không chính xác.',
  })
  @ApiResponse({ status: 404, description: 'Tài khoản không tồn tại.' })
  @ApiBody({ type: LoginUserDto })
  loginInitiate(@Body() loginUserDto: LoginUserDto): Promise<AuthMessageResponseDto> {
    this.logger.log(`Login initiated for ${loginUserDto.email}`);
    return this.authService.loginInitiate(
      loginUserDto.email,
      loginUserDto.password,
    );
  }

  /**
   * @route POST /auth/login/complete
   * @description Bước 2 của quá trình đăng nhập.
   * Xác thực mã OTP được gửi qua email để hoàn tất đăng nhập, sau đó cấp access token và refresh token.
   * @param {LoginCompleteDto} loginCompleteDto - DTO chứa email và mã xác thực.
   * @param {Response} res - Đối tượng response để set cookie.
   * @returns {Promise<LoginResponseDto>} - Access token và thông tin người dùng.
   */
  @Post('login/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'B2 Đăng nhập: Xác thực mã OTP, nhận tokens' })
  @ApiResponse({
    status: 200,
    type: LoginResponseDto,
    description:
      'Đăng nhập thành công, trả về access token và thông tin người dùng.',
  })
  @ApiResponse({
    status: 400,
    description: 'Mã xác thực không hợp lệ hoặc đã hết hạn.',
  })
  @ApiResponse({ status: 401, description: 'Xác thực thất bại.' })
  @ApiBody({ type: LoginCompleteDto })
  async loginComplete(
    @Body() loginCompleteDto: LoginCompleteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    this.logger.log(`Completing login for ${loginCompleteDto.email}`);
    const loginData = await this.authService.loginComplete(
      loginCompleteDto.email,
      loginCompleteDto.verificationCode,
    );

    // Gửi refresh token về client qua httpOnly cookie để bảo mật
    res.cookie('refresh_token', loginData.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      path: '/',
    });

    // Trả về access token và thông tin người dùng trong body của response
    return {
      accessToken: loginData.accessToken,
      user: loginData.user,
    };
  }

  /**
   * @route POST /auth/google/mobile
   * @description Luồng đăng nhập Google DÀNH RIÊNG cho Native Mobile App (Android/iOS).
   * App sẽ tự lấy `idToken` qua Google Sign-In SDK (Popup) và gửi thẳng lên đây.
   * Không cần dùng Redirect hay Deep Link.
   * @param {string} idToken - Token lấy từ Google Credential Manager bên Android
   */
  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập Google Native cho Mobile (Nhận idToken)' })
  @ApiResponse({ status: 200, type: LoginResponseDto, description: 'Trả về accessToken và thông tin user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { idToken: { type: 'string', description: 'Token từ Android' } },
    },
  })
  async googleAuthNative(
    @Body('idToken') idToken: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    this.logger.log(`Received Native Google idToken from Mobile`);

    // 1. Gọi AuthService để verify cái idToken này với Google 
    const loginData = await this.authService.verifyGoogleAndroidToken(idToken);

    // Gửi refresh token về client qua httpOnly cookie để bảo mật
    res.cookie('refresh_token', loginData.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      path: '/',
    });

    // 3. Trả thẳng Access Token cho Android (Android dùng Retrofit hứng phát một)
    return {
      accessToken: loginData.accessToken,
      user: loginData.user,
    };
  }
}
