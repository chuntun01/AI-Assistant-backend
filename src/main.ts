import {NestFactory} from "@nestjs/core";
import {ValidationPipe} from "@nestjs/common";
import {SwaggerModule, DocumentBuilder} from "@nestjs/swagger";
import {AppModule} from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");

  app.enableCors({
    origin: [
      "http://localhost:3000",
      "https://trtassistant.vercel.app/",
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("AI IAM Assistant API")
      .setDescription("API for AI document chatbot with access control")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
    console.log(
      `Swagger docs: http://localhost:${process.env.PORT || 3001}/api/docs`,
    );
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}/api/v1`);
}

bootstrap();
