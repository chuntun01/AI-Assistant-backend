import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Request, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { IsString, IsArray, IsOptional, IsIn } from "class-validator";
import { AuthService } from "./auth.service";
import { RoleService } from "./role.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/guards/roles.decorator";
import { ALL_PERMISSIONS, Permission } from "./role.schema";

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
  @IsOptional() @IsString() roleId?: string; // null = bo role
}

class SetSystemRoleDto {
  @IsString() @IsIn(["admin", "user"]) role: "admin" | "user";
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly roleService: RoleService,
  ) {}

  // â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Tat ca user dang nhap co the xem danh sach (de chon nguoi cap quyen)
  @Get("users")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listUsers() {
    return this.authService.listUsers();
  }

  // Admin: doi system role (admin/user)
  @Patch("users/:id/system-role")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  setSystemRole(@Param("id") id: string, @Body() dto: SetSystemRoleDto) {
    return this.authService.setUserRole(id, dto.role);
  }

  // Admin: gan custom role cho user
  @Patch("users/:id/role")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @ApiBearerAuth()
  assignRole(@Param("id") id: string, @Body() dto: AssignRoleDto) {
    return this.authService.assignRole(id, dto.roleId || null);
  }

  // â”€â”€ Roles (chi admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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