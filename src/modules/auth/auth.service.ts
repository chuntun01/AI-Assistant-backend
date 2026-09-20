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

  // Google OAuth â€” upsert user
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