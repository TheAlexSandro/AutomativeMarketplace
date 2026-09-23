import { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export const REDIS_INSTANCE = Symbol("REDIS_INSTANCE");

export const redisProvider: Provider = {
  provide: REDIS_INSTANCE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Redis(config.getOrThrow<string>("REDIS_URL"));
  },
};
