# setup-google-auth-reset-password.ps1
# Chay trong thu muc ai-iam-assistant-backend
# .\setup-google-auth-reset-password.ps1

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-File($relativePath, $content) {
    $full = Join-Path (Get-Location) $relativePath
    $dir  = Split-Path $full
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($full, $content, $utf8NoBom)
    Write-Host "  [OK] $relativePath" -ForegroundColor Green
}

Write-Host "Cai Google OAuth + Reset Password..." -ForegroundColor Cyan
Write-Host "Truoc khi chay: npm install passport-google-oauth20 @types/passport-google-oauth20 nodemailer @types/nodemailer" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# 1. User Schema — them googleId, resetToken
# ============================================================
Write-File "src\modules\auth\user.schema.ts" @'
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // Nullable voi Google OAuth user (chua co password)
  @Prop({ default: null })
  password: string | null;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ["admin", "user"], default: "user" })
  role: "admin" | "user";

  @Prop({ type: Types.ObjectId, ref: "Role", default: null })
  customRoleId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  // Google OAuth
  @Prop({ default: null })
  googleId: string | null;

  @Prop({ default: null })
  avatar: string | null;

  // Reset password
  @Prop({ default: null })
  resetPasswordToken: string | null;

  @Prop({ default: null })
  resetPasswordExpires: Date | null;
}

export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ googleId: 1 });
UserSchema.index({ resetPasswordToken: 1 });
'@

# ============================================================
# 2. Email Service — gui email reset password
# ============================================================
Write-File "src\common\services\email.service.ts" @'
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: this.config.get<string>("GMAIL_USER"),
        pass: this.config.get<string>("GMAIL_APP_PASSWORD"),
      },
    });
  }

  async sendResetPasswordEmail(email: string, resetUrl: string, name: string): Promise<void> {
    const mailOptions = {
      from: `"AI IAM Assistant" <${this.config.get("GMAIL_USER")}>`,
      to: email,
      subject: "Dat lai mat khau - AI IAM Assistant",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Dat lai mat khau</h2>
          <p>Xin chao <strong>${name}</strong>,</p>
          <p>Ban da yeu cau dat lai mat khau. Click vao nut duoi day de tiep tuc:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}"
              style="background: #2563eb; color: white; padding: 12px 24px;
                     border-radius: 8px; text-decoration: none; font-weight: bold;">
              Dat lai mat khau
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Link nay het han sau <strong>15 phut</strong>.<br/>
            Neu ban khong yeu cau, hay bo qua email nay.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
          <p style="color: #999; font-size: 12px;">AI IAM Assistant</p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    this.logger.log(`Reset password email sent to: ${email}`);
  }
}
'@

# ============================================================
# 3. Google Strategy
# ============================================================
Write-File "src\modules\auth\google.strategy.ts" @'
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService) {
    super({
      clientID:     config.get<string>("GOOGLE_CLIENT_ID"),
      clientSecret: config.get<string>("GOOGLE_CLIENT_SECRET"),
      callbackURL:  config.get<string>("GOOGLE_CALLBACK_URL"),
      scope: ["email", "profile"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, displayName, emails, photos } = profile;
    const user = {
      googleId: id,
      email:    emails[0].value,
      name:     displayName,
      avatar:   photos?.[0]?.value || null,
    };
    done(null, user);
  }
}
'@

# ============================================================
# 4. Auth Service — them Google + Reset Password
# ============================================================
Write-File "src\modules\auth\auth.service.ts" @'
import {
  Injectable, ConflictException, UnauthorizedException,
  NotFoundException, BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { User, UserDocument } from "./user.schema";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { EmailService } from "../../common/services/email.service";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException("Email already registered");

    const hashed = await bcrypt.hash(dto.password, 12);
    const user   = await this.userModel.create({
      email:    dto.email,
      password: hashed,
      name:     dto.name,
    });

    return {
      token: this.signToken(user),
      user:  { id: user._id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    // User dang nhap bang Google, chua co password
    if (!user.password) {
      throw new UnauthorizedException("This account uses Google login. Please sign in with Google.");
    }

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new UnauthorizedException("Invalid email or password");
    if (!user.isActive) throw new UnauthorizedException("Account is disabled");

    return {
      token: this.signToken(user),
      user:  { id: user._id, email: user.email, name: user.name, role: user.role, avatar: user.avatar },
    };
  }

  // Google OAuth — upsert user
  async googleLogin(googleUser: {
    googleId: string;
    email:    string;
    name:     string;
    avatar:   string | null;
  }) {
    let user = await this.userModel.findOne({
      $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    });

    if (user) {
      // Cap nhat googleId neu chua co
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.avatar   = googleUser.avatar;
        await user.save();
      }
    } else {
      // Tao user moi tu Google
      user = await this.userModel.create({
        googleId: googleUser.googleId,
        email:    googleUser.email,
        name:     googleUser.name,
        avatar:   googleUser.avatar,
        password: null, // Google user khong co password
      });
    }

    if (!user.isActive) throw new UnauthorizedException("Account is disabled");

    return {
      token: this.signToken(user),
      user:  { id: user._id, email: user.email, name: user.name, role: user.role, avatar: user.avatar },
    };
  }

  // Gui email reset password
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });

    // Khong tiet lo email co ton tai hay khong (security)
    if (!user) return;

    // Google user khong co password -> khong reset
    if (!user.password && user.googleId) return;

    // Tao token ngau nhien
    const resetToken   = crypto.randomBytes(32).toString("hex");
    const hashedToken  = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expires      = new Date(Date.now() + 15 * 60 * 1000); // 15 phut

    await this.userModel.findByIdAndUpdate(user._id, {
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: expires,
    });

    const frontendUrl = this.config.get<string>("FRONTEND_URL") || "http://localhost:3000";
    const resetUrl    = `${frontendUrl}/reset-password?token=${resetToken}&email=${email}`;

    await this.emailService.sendResetPasswordEmail(email, resetUrl, user.name);
  }

  // Dat lai password
  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await this.userModel.findOne({
      email:                email.toLowerCase(),
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: new Date() }, // chua het han
    });

    if (!user) {
      throw new BadRequestException("Token khong hop le hoac da het han");
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await this.userModel.findByIdAndUpdate(user._id, {
      password:             hashed,
      resetPasswordToken:   null,
      resetPasswordExpires: null,
    });
  }

  async getProfile(userId: string) {
    return this.userModel
      .findById(userId)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .populate("customRoleId", "name permissions description")
      .lean();
  }

  async listUsers() {
    return this.userModel
      .find()
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .populate("customRoleId", "name permissions")
      .sort({ createdAt: -1 })
      .lean();
  }

  async setUserRole(userId: string, role: "admin" | "user") {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { role }, { new: true })
      .select("-password");
    if (!user) throw new NotFoundException("User not found");
    return { success: true, data: user };
  }

  async assignRole(userId: string, roleId: string | null) {
    const update = roleId
      ? { customRoleId: new Types.ObjectId(roleId) }
      : { $unset: { customRoleId: "" } };

    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { new: true })
      .select("-password")
      .populate("customRoleId", "name permissions");

    if (!user) throw new NotFoundException("User not found");
    return { success: true, data: user };
  }

  private signToken(user: UserDocument): string {
    return this.jwtService.sign({
      sub:   user._id.toString(),
      email: user.email,
      role:  user.role,
    });
  }
}
'@

# ============================================================
# 5. Auth Controller — them Google + Reset Password endpoints
# ============================================================
Write-File "src\modules\auth\auth.controller.ts" @'
import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Request, UseGuards,
  HttpCode, HttpStatus, Res, Query,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { IsString, IsArray, IsOptional, IsIn, IsEmail, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { RoleService } from "./role.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/guards/roles.decorator";
import { Permission } from "./role.schema";
import { ConfigService } from "@nestjs/config";

class CreateRoleDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() permissions: Permission[];
}

class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() permissions?: Permission[];
}

class AssignRoleDto {
  @IsOptional() @IsString() roleId?: string;
}

class SetSystemRoleDto {
  @IsString() @IsIn(["admin", "user"]) role: "admin" | "user";
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsString() token: string;
  @IsEmail()  email: string;
  @IsString() @MinLength(6) newPassword: string;
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly roleService: RoleService,
    private readonly config: ConfigService,
  ) {}

  // ── Register / Login ──────────────────────────────────────
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  // ── Google OAuth ──────────────────────────────────────────
  // GET /auth/google -> redirect to Google
  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // Passport tu xu ly redirect
  }

  // GET /auth/google/callback -> sau khi Google xac thuc
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(@Request() req: any, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user);
    const frontendUrl = this.config.get<string>("FRONTEND_URL") || "http://localhost:3000";

    // Redirect ve frontend kem token
    res.redirect(`${frontendUrl}/auth/callback?token=${result.token}&name=${encodeURIComponent(result.user.name)}&role=${result.user.role}`);
  }

  // ── Reset Password ────────────────────────────────────────
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    // Luon tra ve success de tranh leak email ton tai hay khong
    return { success: true, message: "Neu email ton tai, ban se nhan duoc link dat lai mat khau." };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
    return { success: true, message: "Mat khau da duoc dat lai thanh cong." };
  }

  // ── Users ─────────────────────────────────────────────────
  @Get("users")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listUsers() {
    return this.authService.listUsers();
  }

  @Patch("users/:id/system-role")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  setSystemRole(@Param("id") id: string, @Body() dto: SetSystemRoleDto) {
    return this.authService.setUserRole(id, dto.role);
  }

  @Patch("users/:id/role")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  assignRole(@Param("id") id: string, @Body() dto: AssignRoleDto) {
    return this.authService.assignRole(id, dto.roleId || null);
  }

  // ── Roles ─────────────────────────────────────────────────
  @Get("roles")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listRoles() {
    return this.roleService.listRoles();
  }

  @Get("roles/permissions")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getPermissions() {
    return { data: this.roleService.getAllPermissions() };
  }

  @Post("roles")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  createRole(@Body() dto: CreateRoleDto) {
    return this.roleService.createRole(dto.name, dto.permissions, dto.description);
  }

  @Patch("roles/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  updateRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.updateRole(id, dto);
  }

  @Delete("roles/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRole(@Param("id") id: string) {
    return this.roleService.deleteRole(id);
  }
}
'@

# ============================================================
# 6. Auth Module — them GoogleStrategy + EmailService
# ============================================================
Write-File "src\modules\auth\auth.module.ts" @'
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RoleService } from "./role.service";
import { JwtStrategy } from "./jwt.strategy";
import { GoogleStrategy } from "./google.strategy";
import { User, UserSchema } from "./user.schema";
import { Role, RoleSchema } from "./role.schema";
import { EmailService } from "../../common/services/email.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_EXPIRES_IN") || "7d" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RoleService, JwtStrategy, GoogleStrategy, EmailService],
  exports: [AuthService, RoleService, JwtModule, PassportModule],
})
export class AuthModule {}
'@

Write-Host ""
Write-Host "=== Backend xong! ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. npm install passport-google-oauth20 @types/passport-google-oauth20 nodemailer @types/nodemailer" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Them vao .env:" -ForegroundColor Cyan
Write-Host "   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com"
Write-Host "   GOOGLE_CLIENT_SECRET=GOCSPX-xxx"
Write-Host "   GOOGLE_CALLBACK_URL=http://localhost:3001/api/v1/auth/google/callback"
Write-Host "   GMAIL_USER=your@gmail.com"
Write-Host "   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx"
Write-Host "   FRONTEND_URL=http://localhost:3000"
Write-Host ""
Write-Host "3. Tao Google OAuth credentials tai:" -ForegroundColor Cyan
Write-Host "   https://console.cloud.google.com"
Write-Host "   -> APIs & Services -> Credentials -> Create OAuth 2.0 Client ID"
Write-Host ""
Write-Host "4. Tao Gmail App Password tai:" -ForegroundColor Cyan
Write-Host "   https://myaccount.google.com/apppasswords"
Write-Host "   (can bat 2FA truoc)"