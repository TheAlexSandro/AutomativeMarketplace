import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { ListingsModule } from "./modules/listings/listings.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { SearchModule } from "./modules/search/search.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    ListingsModule,
    CategoriesModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
