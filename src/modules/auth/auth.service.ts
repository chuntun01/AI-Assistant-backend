import {
  Injectable, ConflictException, UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { User, UserDocument } from "./user.schema";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({ email: dto.email });
    if (exists) throw new ConflictException("Email already registered");

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      email: dto.email,
      password: hashed,
      name: dto.name,
    });

    return {
      token: this.signToken(user),
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email });
    if (!user) throw new UnauthorizedException("Invalid email or password");

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new UnauthorizedException("Invalid email or password");
    if (!user.isActive) throw new UnauthorizedException("Account is disabled");

    return {
      token: this.signToken(user),
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    };
  }

  async getProfile(userId: string) {
    return this.userModel
      .findById(userId)
      .select("-password")
      .populate("customRoleId", "name permissions description")
      .lean();
  }

  async listUsers() {
    return this.userModel
      .find()
      .select("-password")
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

  // Gan custom role (RBAC) cho user
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
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
  }
}