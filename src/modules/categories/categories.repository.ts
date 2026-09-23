import { Inject, Injectable } from "@nestjs/common";
import { Kysely } from "kysely";
import { Database } from "../../infrastructure/database/database.types";
import { KYSELY_INSTANCE } from "../../infrastructure/database/database.provider";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  // Fetch every category flat building the nested tree happens in the
  // service layer. One query beats N+1 recursive round-trips, and the
  // category table is small/rarely changes, so this stays cheap even
  // as the tree grows.
  async findAllFlat() {
    return this.db
      .selectFrom("categories")
      .selectAll()
      .orderBy("depth", "asc")
      .orderBy("name", "asc")
      .execute();
  }

  async findById(id: number) {
    return this.db
      .selectFrom("categories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  // Direct children only (depth = 1 relative to this node in the closure table)
  async findDirectChildren(parentId: number) {
    return this.db
      .selectFrom("categories")
      .selectAll()
      .where("parent_id", "=", parentId)
      .orderBy("name", "asc")
      .execute();
  }

  // All descendant IDs (any depth) used to scope listing queries to a
  // category + its subcategories via a single indexed closure-table lookup.
  async findDescendantIds(categoryId: number): Promise<number[]> {
    const rows = await this.db
      .selectFrom("category_closure")
      .select("descendant_id")
      .where("ancestor_id", "=", categoryId)
      .execute();

    return rows.map((r) => r.descendant_id);
  }

  async create(dto: CreateCategoryDto) {
    let depth = 0;

    if (dto.parentId) {
      const parent = await this.findById(dto.parentId);
      if (!parent) throw new Error(`Parent category ${dto.parentId} not found`);
      depth = parent.depth + 1;
    }

    // Closure table rows (self + inherited ancestors) are filled in
    // automatically by the trg_category_closure_insert trigger.
    return this.db
      .insertInto("categories")
      .values({
        name: dto.name,
        slug: dto.slug,
        parent_id: dto.parentId ?? null,
        depth,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: number, dto: UpdateCategoryDto) {
    return this.db
      .updateTable("categories")
      .set({
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  // Fetch which filter attributes apply to a category (for GET /filters/:categoryId)
  async findFilterAttributes(categoryId: number) {
    return this.db
      .selectFrom("category_filter_attributes")
      .innerJoin(
        "filter_attributes",
        "filter_attributes.id",
        "category_filter_attributes.attribute_id",
      )
      .select([
        "filter_attributes.id",
        "filter_attributes.code",
        "filter_attributes.label",
        "filter_attributes.type",
        "filter_attributes.enum_options",
        "filter_attributes.range_meta",
        "category_filter_attributes.is_required",
      ])
      .where("category_filter_attributes.category_id", "=", categoryId)
      .orderBy("category_filter_attributes.display_order", "asc")
      .execute();
  }
}
