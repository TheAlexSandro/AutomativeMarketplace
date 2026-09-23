import { Inject, Injectable } from "@nestjs/common";
import { Kysely, sql } from "kysely";
import { Database } from "../../infrastructure/database/database.types";
import { KYSELY_INSTANCE } from "../../infrastructure/database/database.provider";

@Injectable()
export class SearchRepository {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  // Autocomplete: prefix match across make, model, city, deduplicated,
  // capped per field. Relies on the lower()+text_pattern_ops indexes
  // in schema.sql for index-only prefix scans.
  async suggest(term: string, limitPerField = 5) {
    const needle = `${term.toLowerCase()}%`;

    const [makes, models, cities] = await Promise.all([
      this.db
        .selectFrom("listings")
        .select("make")
        .distinct()
        .where(sql<boolean>`lower(make) like ${needle}`)
        .where("deleted_at", "is", null)
        .limit(limitPerField)
        .execute(),
      this.db
        .selectFrom("listings")
        .select("model")
        .distinct()
        .where(sql<boolean>`lower(model) like ${needle}`)
        .where("deleted_at", "is", null)
        .limit(limitPerField)
        .execute(),
      this.db
        .selectFrom("listings")
        .select("location_city")
        .distinct()
        .where(sql<boolean>`lower(location_city) like ${needle}`)
        .where("deleted_at", "is", null)
        .limit(limitPerField)
        .execute(),
    ]);

    return {
      makes: makes.map((r) => r.make),
      models: models.map((r) => r.model),
      cities: cities.map((r) => r.location_city),
    };
  }

  // One grouped-count query per facet column, run in parallel.
  // Each is a simple GROUP BY hitting the partial index on
  // deleted_at IS NULL, so this stays fast even at scale but it's
  // still N queries, which is exactly why the service layer caches
  // the combined result in Redis.
  async facetCounts() {
    const [make, fuelType, transmission, condition, status] = await Promise.all(
      [
        this.db
          .selectFrom("listings")
          .select(["make", sql<number>`count(*)`.as("count")])
          .where("deleted_at", "is", null)
          .groupBy("make")
          .orderBy("count", "desc")
          .execute(),
        this.db
          .selectFrom("listings")
          .select(["fuel_type", sql<number>`count(*)`.as("count")])
          .where("deleted_at", "is", null)
          .groupBy("fuel_type")
          .execute(),
        this.db
          .selectFrom("listings")
          .select(["transmission", sql<number>`count(*)`.as("count")])
          .where("deleted_at", "is", null)
          .groupBy("transmission")
          .execute(),
        this.db
          .selectFrom("listings")
          .select(["condition", sql<number>`count(*)`.as("count")])
          .where("deleted_at", "is", null)
          .groupBy("condition")
          .execute(),
        this.db
          .selectFrom("listings")
          .select(["status", sql<number>`count(*)`.as("count")])
          .where("deleted_at", "is", null)
          .groupBy("status")
          .execute(),
      ],
    );

    const priceYearRange = await this.db
      .selectFrom("listings")
      .select([
        sql<number>`min(price)`.as("minPrice"),
        sql<number>`max(price)`.as("maxPrice"),
        sql<number>`min(year)`.as("minYear"),
        sql<number>`max(year)`.as("maxYear"),
      ])
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    return {
      make,
      fuelType,
      transmission,
      condition,
      status,
      range: priceYearRange,
    };
  }
}
