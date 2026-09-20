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

  // â”€â”€ Register / Login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Google OAuth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const avatar = result.user.avatar ? encodeURIComponent(result.user.avatar) : "";
    res.redirect(
      `${frontendUrl}/auth/callback?token=${result.token}` +
      `&name=${encodeURIComponent(result.user.name)}` +
      `&role=${result.user.role}` +
      `&id=${result.user.id}` +
      `&avatar=${avatar}`
    );
  }

  // â”€â”€ Reset Password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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