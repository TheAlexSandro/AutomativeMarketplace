import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true,
      transform: true, // apply @Type() coercions from query/body
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Automotive Marketplace API")
    .setDescription(
      "REST API for a vehicle marketplace: listings, hierarchical categories, " +
        "dynamic filter attributes, and full-text/faceted search.",
    )
    .setVersion("1.0")
    .addTag("listings")
    .addTag("categories")
    .addTag("search")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document); // GET /docs

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
