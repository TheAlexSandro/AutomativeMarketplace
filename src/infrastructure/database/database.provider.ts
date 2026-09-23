import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from './database.types';

export const KYSELY_INSTANCE = Symbol('KYSELY_INSTANCE');

export const databaseProvider: Provider = {
  provide: KYSELY_INSTANCE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = new PostgresDialect({
      pool: new Pool({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: 10,
      }),
    });

    return new Kysely<Database>({ dialect });
  },
};
