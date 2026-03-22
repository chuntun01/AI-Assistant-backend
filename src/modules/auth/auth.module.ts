import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RoleService } from "./role.service";
import { JwtStrategy } from "./jwt.strategy";
import { User, UserSchema } from "./user.schema";
import { Role, RoleSchema } from "./role.schema";

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
  providers: [AuthService, RoleService, JwtStrategy],
  exports: [AuthService, RoleService, JwtModule, PassportModule],
})
export class AuthModule {}