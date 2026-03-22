import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from "@nestjs/common";
import {Reflector} from "@nestjs/core";
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {User, UserDocument} from "../../modules/auth/user.schema";
import {Role, RoleDocument} from "../../modules/auth/role.schema";
import {Permission} from "../../modules/auth/role.schema";

export const PERMISSION_KEY = "required_permission";
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Khong yeu cau permission cu the -> cho qua
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException("Unauthorized");

    // Admin co tat ca quyen
    if (user.role === "admin") return true;

    // Lay user day du de co customRoleId
    const fullUser = await this.userModel.findById(user.id).lean();
    if (!fullUser?.customRoleId) {
      // User chua co role → cho phep doc:read va chat:use mac dinh
      const defaultAllow: string[] = ["doc:read", "chat:use"];
      if (defaultAllow.includes(required)) return true;
      throw new ForbiddenException(`Ban can duoc cap quyen: "${required}"`);
    }

    // Kiem tra role co permission khong
    const role = await this.roleModel.findById(fullUser.customRoleId).lean();
    if (!role || !role.isActive) {
      throw new ForbiddenException("Your role is inactive");
    }

    if (!role.permissions.includes(required)) {
      throw new ForbiddenException(
        `Your role "${role.name}" does not have permission: "${required}"`,
      );
    }

    // Gan role info vao request de dung tiep
    req.userRole = role;
    return true;
  }
}
