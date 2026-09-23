/**
 * Seed script - run with: npm run seed
 *
 * Order matters: categories (with closure table via DB trigger) >>
 * filter_attributes >> category_filter_attributes >> listings >>
 * listing_attribute_values. Each step depends on IDs from the step
 * before it, so this stays a straight-line script rather than
 * parallel inserts.
 */
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { faker } from "@faker-js/faker";
import * as dotenv from "dotenv";
import { Database } from "../src/infrastructure/database/database.types";

dotenv.config();

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
  }),
});

const TOTAL_LISTINGS = 600; // > 500 required minimum

// ---------------------------------------------------------------------
// Category tree, depth 3 in one branch (Cars > SUV > 7-Seater) to
// exercise the closure table's arbitrary-depth support.
// ---------------------------------------------------------------------
const CATEGORY_TREE = [
  {
    name: "Cars",
    slug: "cars",
    children: [
      {
        name: "SUV",
        slug: "suv",
        children: [
          { name: "7-Seater", slug: "suv-7-seater" },
          { name: "5-Seater", slug: "suv-5-seater" },
        ],
      },
      { name: "Sedan", slug: "sedan" },
      { name: "Hatchback", slug: "hatchback" },
    ],
  },
  {
    name: "Motorcycles",
    slug: "motorcycles",
    children: [
      { name: "Sport", slug: "motorcycle-sport" },
      { name: "Cruiser", slug: "motorcycle-cruiser" },
      { name: "Scooter", slug: "motorcycle-scooter" },
    ],
  },
];

// Category-specific dynamic filter attributes (EAV). 'seating_capacity'
// and 'has_sunroof' only apply to Cars, this is what proves the
// "fuel type only appears under Cars, not Motorcycles" requirement,
// generalized to arbitrary attributes.
const FILTER_ATTRIBUTES = [
  {
    code: "seating_capacity",
    label: "Seating Capacity",
    type: "range" as const,
    range_meta: { unit: "seats", min: 2, max: 8 },
    categories: [
      "cars",
      "suv",
      "sedan",
      "hatchback",
      "suv-7-seater",
      "suv-5-seater",
    ],
  },
  {
    code: "has_sunroof",
    label: "Sunroof",
    type: "boolean" as const,
    categories: ["cars", "suv", "sedan"],
  },
  {
    code: "drivetrain",
    label: "Drivetrain",
    type: "enum" as const,
    enum_options: ["FWD", "RWD", "AWD", "4WD"],
    categories: ["cars", "suv"],
  },
  {
    code: "engine_cc",
    label: "Engine Displacement",
    type: "range" as const,
    range_meta: { unit: "cc", min: 100, max: 1800 },
    categories: [
      "motorcycles",
      "motorcycle-sport",
      "motorcycle-cruiser",
      "motorcycle-scooter",
    ],
  },
  {
    code: "has_abs",
    label: "ABS Brakes",
    type: "boolean" as const,
    categories: ["motorcycles", "motorcycle-sport"],
  },
];

const CAR_MAKES: Record<string, string[]> = {
  Toyota: ["Avanza", "Innova", "Fortuner", "Rush", "Yaris"],
  Honda: ["Brio", "HR-V", "CR-V", "Civic", "Jazz"],
  Mitsubishi: ["Xpander", "Pajero Sport", "Outlander"],
  Suzuki: ["Ertiga", "XL7", "Baleno"],
  Daihatsu: ["Xenia", "Terios", "Ayla"],
};

const MOTORCYCLE_MAKES: Record<string, string[]> = {
  Honda: ["Vario", "PCX", "CBR150R", "CB150R"],
  Yamaha: ["NMAX", "Aerox", "R15", "XSR155"],
  Kawasaki: ["Ninja 250", "W175"],
};

const CITIES = [
  "Jakarta",
  "Surabaya",
  "Bandung",
  "Blitar",
  "Malang",
  "Semarang",
  "Yogyakarta",
  "Medan",
];

async function seedCategories() {
  const idBySlug = new Map<string, number>();

  for (const parent of CATEGORY_TREE) {
    const parentRow = await db
      .insertInto("categories")
      .values({
        name: parent.name,
        slug: parent.slug,
        parent_id: null,
        depth: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    idBySlug.set(parent.slug, parentRow.id);

    for (const child of parent.children ?? []) {
      const childRow = await db
        .insertInto("categories")
        .values({
          name: child.name,
          slug: child.slug,
          parent_id: parentRow.id,
          depth: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      idBySlug.set(child.slug, childRow.id);

      for (const grandchild of (child as any).children ?? []) {
        const gcRow = await db
          .insertInto("categories")
          .values({
            name: grandchild.name,
            slug: grandchild.slug,
            parent_id: childRow.id,
            depth: 2,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        idBySlug.set(grandchild.slug, gcRow.id);
      }
    }
  }

  console.log(`Seeded ${idBySlug.size} categories`);
  return idBySlug;
}

async function seedFilterAttributes(idBySlug: Map<string, number>) {
  const attributeIdByCode = new Map<string, number>();

  for (const attr of FILTER_ATTRIBUTES) {
    const row = await db
      .insertInto("filter_attributes")
      .values({
        code: attr.code,
        label: attr.label,
        type: attr.type,
        enum_options:
          "enum_options" in attr
            ? (JSON.stringify(attr.enum_options) as any)
            : null,
        range_meta:
          "range_meta" in attr
            ? (JSON.stringify(attr.range_meta) as any)
            : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    attributeIdByCode.set(attr.code, row.id);

    for (const slug of attr.categories) {
      const categoryId = idBySlug.get(slug);
      if (!categoryId) continue;
      await db
        .insertInto("category_filter_attributes")
        .values({
          category_id: categoryId,
          attribute_id: row.id,
          is_required: false,
          display_order: 0,
        })
        .execute();
    }
  }

  console.log(`Seeded ${attributeIdByCode.size} filter attributes`);
  return attributeIdByCode;
}

function randomAttributeValuesFor(
  categorySlug: string,
  attributeIdByCode: Map<string, number>,
) {
  const isCar =
    !categorySlug.startsWith("motorcycle") && categorySlug !== "motorcycles";
  const values: {
    attribute_id: number;
    value_text?: string;
    value_numeric?: string;
    value_boolean?: boolean;
  }[] = [];

  if (isCar) {
    values.push({
      attribute_id: attributeIdByCode.get("seating_capacity")!,
      value_numeric: String(faker.helpers.arrayElement([2, 4, 5, 7])),
    });
    values.push({
      attribute_id: attributeIdByCode.get("has_sunroof")!,
      value_boolean: faker.datatype.boolean(),
    });
    values.push({
      attribute_id: attributeIdByCode.get("drivetrain")!,
      value_text: faker.helpers.arrayElement(["FWD", "RWD", "AWD", "4WD"]),
    });
  } else {
    values.push({
      attribute_id: attributeIdByCode.get("engine_cc")!,
      value_numeric: String(faker.number.int({ min: 110, max: 1000 })),
    });
    values.push({
      attribute_id: attributeIdByCode.get("has_abs")!,
      value_boolean: faker.datatype.boolean(),
    });
  }

  return values;
}

async function seedListings(
  idBySlug: Map<string, number>,
  attributeIdByCode: Map<string, number>,
) {
  const leafCategories = [
    "suv-7-seater",
    "suv-5-seater",
    "sedan",
    "hatchback",
    "motorcycle-sport",
    "motorcycle-cruiser",
    "motorcycle-scooter",
  ];

  for (let i = 0; i < TOTAL_LISTINGS; i++) {
    const categorySlug = faker.helpers.arrayElement(leafCategories);
    const categoryId = idBySlug.get(categorySlug)!;
    const isCar = !categorySlug.startsWith("motorcycle");

    const makesPool = isCar ? CAR_MAKES : MOTORCYCLE_MAKES;
    const make = faker.helpers.arrayElement(Object.keys(makesPool));
    const model = faker.helpers.arrayElement(makesPool[make]);

    const listing = await db
      .insertInto("listings")
      .values({
        seller_id: faker.number.int({ min: 1, max: 50 }), // assumes 50 dummy sellers exist elsewhere
        category_id: categoryId,
        make,
        model,
        year: faker.number.int({ min: 2014, max: 2025 }),
        mileage: faker.number.int({ min: 0, max: 150_000 }),
        price: String(
          faker.number.int({
            min: isCar ? 90_000_000 : 12_000_000,
            max: isCar ? 750_000_000 : 45_000_000,
          }),
        ),
        condition: faker.helpers.arrayElement([
          "new",
          "used",
          "certified_pre_owned",
        ]),
        transmission: isCar
          ? faker.helpers.arrayElement(["manual", "automatic", "cvt"])
          : faker.helpers.arrayElement(["manual", "automatic"]),
        fuel_type: faker.helpers.arrayElement([
          "petrol",
          "diesel",
          "electric",
          "hybrid",
        ]),
        color: faker.vehicle.color(),
        location_city: faker.helpers.arrayElement(CITIES),
        status: faker.helpers.weightedArrayElement([
          { value: "available", weight: 8 },
          { value: "pending", weight: 1 },
          { value: "sold", weight: 1 },
        ]),
        description: faker.lorem.sentences(2),
        images: JSON.stringify([
          faker.image.urlLoremFlickr({ category: "transport" }),
        ]) as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const attrValues = randomAttributeValuesFor(
      categorySlug,
      attributeIdByCode,
    );
    for (const v of attrValues) {
      await db
        .insertInto("listing_attribute_values")
        .values({ listing_id: listing.id, ...v })
        .execute();
    }

    if ((i + 1) % 100 === 0)
      console.log(`  ...${i + 1}/${TOTAL_LISTINGS} listings seeded`);
  }

  console.log(`Seeded ${TOTAL_LISTINGS} listings`);
}

async function main() {
  console.log("Seeding categories...");
  const idBySlug = await seedCategories();

  console.log("Seeding filter attributes...");
  const attributeIdByCode = await seedFilterAttributes(idBySlug);

  console.log(
    "Seeding listings (this takes a bit, sequential inserts for clarity)...",
  );
  await seedListings(idBySlug, attributeIdByCode);

  console.log("Done.");
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
