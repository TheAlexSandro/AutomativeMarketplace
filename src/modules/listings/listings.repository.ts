import { Inject, Injectable } from "@nestjs/common";
import { Kysely, sql } from "kysely";
import {
  Database,
  FuelType,
} from "../../infrastructure/database/database.types";
import { KYSELY_INSTANCE } from "../../infrastructure/database/database.provider";
import { QueryListingsDto } from "./dto/query-listings.dto";
import { CreateListingDto } from "./dto/create-listing.dto";

@Injectable()
export class ListingsRepository {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  // Cursor pagination: cursor = base64("<created_at_iso>|<id>")
  async findMany(query: QueryListingsDto) {
    let qb = this.db
      .selectFrom("listings")
      .selectAll()
      .where("deleted_at", "is", null);

    if (query.make) qb = qb.where("make", "=", query.make);
    if (query.minPrice) qb = qb.where("price", ">=", String(query.minPrice));
    if (query.maxPrice) qb = qb.where("price", "<=", String(query.maxPrice));
    if (query.year) qb = qb.where("year", "=", query.year);
    if (query.fuelType)
      qb = qb.where("fuel_type", "=", query.fuelType as FuelType);
    if (query.categoryId) qb = qb.where("category_id", "=", query.categoryId);

    if (query.cursor) {
      const [createdAt, id] = Buffer.from(query.cursor, "base64")
        .toString("utf-8")
        .split("|");
      qb = qb.where((eb) =>
        eb.or([
          eb("created_at", "<", new Date(createdAt)),
          eb.and([
            eb("created_at", "=", new Date(createdAt)),
            eb("id", "<", Number(id)),
          ]),
        ]),
      );
    }

    const rows = await qb
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(query.limit ?? 20)
      .execute();

    const nextCursor =
      rows.length > 0
        ? Buffer.from(
            `${rows[rows.length - 1].created_at.toISOString()}|${rows[rows.length - 1].id}`,
          ).toString("base64")
        : null;

    return { data: rows, nextCursor };
  }

  async findById(id: number) {
    return this.db
      .selectFrom("listings")
      .selectAll()
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
  }

  // Scope listings to a category AND all its descendants via closure table
  async findByCategoryIncludingChildren(categoryId: number, limit = 20) {
    return this.db
      .selectFrom("listings")
      .innerJoin(
        "category_closure",
        "category_closure.descendant_id",
        "listings.category_id",
      )
      .selectAll("listings")
      .where("category_closure.ancestor_id", "=", categoryId)
      .where("listings.deleted_at", "is", null)
      .orderBy("listings.created_at", "desc")
      .limit(limit)
      .execute();
  }

  // Variant that takes an already-resolved list of category IDs (e.g. from
  // CategoriesService.getDescendantIds), avoiding a second closure-table
  // join when the caller already has the IDs.
  async findByCategoryIds(categoryIds: number[], limit = 20) {
    if (categoryIds.length === 0) return [];

    return this.db
      .selectFrom("listings")
      .selectAll()
      .where("category_id", "in", categoryIds)
      .where("deleted_at", "is", null)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
  }

  // Full-text search using the generated search_vector column
  async search(term: string, limit = 20) {
    return this.db
      .selectFrom("listings")
      .selectAll()
      .where("deleted_at", "is", null)
      .where(sql<boolean>`search_vector @@ plainto_tsquery('simple', ${term})`)
      .orderBy(
        sql`ts_rank(search_vector, plainto_tsquery('simple', ${term}))`,
        "desc",
      )
      .limit(limit)
      .execute();
  }

  // Facet counts for a given filter column (used by GET /filters)
  async facetCounts(
    column: "make" | "fuel_type" | "transmission" | "condition",
  ) {
    return this.db
      .selectFrom("listings")
      .select([column, sql<number>`count(*)`.as("count")])
      .where("deleted_at", "is", null)
      .groupBy(column)
      .execute();
  }

  async create(dto: CreateListingDto) {
    return this.db
      .insertInto("listings")
      .values({
        seller_id: dto.sellerId,
        category_id: dto.categoryId,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        mileage: dto.mileage,
        price: String(dto.price),
        condition: dto.condition as any,
        transmission: dto.transmission as any,
        fuel_type: dto.fuelType as any,
        color: dto.color ?? null,
        location_city: dto.locationCity,
        description: dto.description ?? null,
        images: JSON.stringify(dto.images ?? []) as any,
        status: "available",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: number, dto: Partial<CreateListingDto>) {
    return this.db
      .updateTable("listings")
      .set({
        ...(dto.make && { make: dto.make }),
        ...(dto.model && { model: dto.model }),
        ...(dto.price !== undefined && { price: String(dto.price) }),
        ...(dto.mileage !== undefined && { mileage: dto.mileage }),
        ...(dto.description !== undefined && { description: dto.description }),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async softDelete(id: number) {
    return this.db
      .updateTable("listings")
      .set({ status: "removed", deleted_at: new Date().toISOString() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
