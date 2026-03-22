import {
  Injectable, NotFoundException, ConflictException,
  OnModuleInit, Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Role, RoleDocument, Permission, DEFAULT_ROLES, ALL_PERMISSIONS } from "./role.schema";

@Injectable()
export class RoleService implements OnModuleInit {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  // Seed 2 role mac dinh khi khoi dong
  async onModuleInit() {
    for (const r of DEFAULT_ROLES) {
      const exists = await this.roleModel.findOne({ name: r.name });
      if (!exists) {
        await this.roleModel.create(r);
        this.logger.log(`Seeded default role: ${r.name}`);
      }
    }
  }

  async listRoles(): Promise<RoleDocument[]> {
    return this.roleModel.find({ isActive: true }).lean() as any;
  }

  async getRole(id: string): Promise<RoleDocument> {
    const role = await this.roleModel.findById(id);
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  async createRole(name: string, permissions: Permission[], description?: string): Promise<RoleDocument> {
    const exists = await this.roleModel.findOne({ name: name.trim() });
    if (exists) throw new ConflictException(`Role "${name}" already exists`);
    return this.roleModel.create({ name: name.trim(), permissions, description });
  }

  async updateRole(id: string, data: { name?: string; permissions?: Permission[]; description?: string }): Promise<RoleDocument> {
    const role = await this.roleModel.findByIdAndUpdate(id, data, { new: true });
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  async deleteRole(id: string): Promise<void> {
    const result = await this.roleModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException("Role not found");
  }

  // Lay permissions cua 1 role
  async getRolePermissions(roleId: string | null): Promise<Permission[]> {
    if (!roleId) return [];
    const role = await this.roleModel.findById(roleId).lean();
    return role?.permissions || [];
  }

  getAllPermissions() {
    return ALL_PERMISSIONS;
  }
}