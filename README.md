# Automotive Marketplace API

REST API for a vehicle marketplace sellers list vehicles, buyers browse,
filter, and search listings. Built for the PT. Daya Rekadigital Indonesia
backend take-home assessment.

## Tech stack

| Component | Choice                                                       | Why                                                                                                                                   |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | Node.js + NestJS                                             | Structured DI makes clean architecture straightforward to enforce.                                                                    |
| Database  | PostgreSQL                                                   | Native full-text search (`tsvector`/GIN) and recursive-friendly closure tables avoid needing a separate search engine for this scale. |
| DB access | [Kysely](https://kysely.dev) (query builder, **not an ORM**) | Type-safe SQL without hiding query shape or adding N+1-prone lazy loading.                                                            |
| Caching   | Redis                                                        | Cache-aside for facet counts, which are the most expensive repeated aggregation.                                                      |

No ORM (Prisma/TypeORM/Sequelize) is used anywhere every query in
`*.repository.ts` files is explicit Kysely query-builder code, per the
assessment's constraints.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and adjust if needed
cp .env.example .env

# 4. Seed the database (600 listings across the category tree)
npm run seed

# 5. Run the API
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger docs: `http://localhost:3000/docs`

## Environment variables

See `.env.example`. Key ones:

- `DATABASE_URL` - Postgres connection string
- `REDIS_URL` - Redis connection string
- `PORT` - API port (default 3000)

## Architecture

```
src/
├── infrastructure/       # cross-cutting: DB connection, Redis connection
│   ├── database/         # Kysely instance + typed table interfaces
│   └── redis/
├── modules/
│   ├── listings/         # controller >> service >> repository
│   ├── categories/       # category tree, closure-table queries
│   └── search/           # full-text search, autocomplete, facet counts
```

Each module follows the same layering:

- **Controller** - HTTP concerns only (routing, DTO validation via `class-validator`).
- **Service** - business logic, orchestrates repositories, owns cross-module calls (e.g. `CategoriesController` calling `ListingsService`).
- **Repository** - the _only_ layer that touches the database. All SQL lives here, written with Kysely's query builder.

This keeps services unit-testable with mocked repositories, and keeps SQL
in one place per domain instead of scattered across controllers.

## Schema design rationale

Full schema: [`schema.sql`](./schema.sql). Key decisions:

### Category tree: closure table

Categories support arbitrary depth (`Cars > SUV > 7-Seater`). Two common
strategies exist adjacency list with recursive CTEs, or a **closure
table** (every ancestor/descendant pair pre-materialized). This project
uses a closure table because:

- `GET /categories/:id/listings` needs "this category + all descendants"
  on every request a closure table turns that into a single indexed
  lookup (`WHERE ancestor_id = ?`) instead of a recursive CTE per request.
- The tree is written rarely (categories are mostly static, curated data)
  but read constantly (every listing browse/filter), so the closure
  table's insert-time overhead is the right trade-off.
- A trigger (`trg_category_closure_insert`) maintains the closure table
  automatically on category creation, so the extra structure doesn't leak
  into application code.

### Dynamic filter attributes: EAV

Fuel type, transmission, etc. are fixed columns on `listings` since every
vehicle has them. But category-specific attributes (seating capacity and
sunroof for cars, engine displacement and ABS for motorcycles) use an
Entity-Attribute-Value pattern:

- `filter_attributes` defines each attribute once (code, label, type: enum/range/boolean).
- `category_filter_attributes` maps which attributes apply to which category.
- `listing_attribute_values` stores each listing's actual values.

This means adding a new vehicle type with entirely different filterable
attributes never requires a schema migration just new rows.

### Indexing strategy

- Partial indexes (`WHERE deleted_at IS NULL`) on all hot listing columns,
  since soft-deleted rows are never queried in normal browsing.
- A generated `search_vector` column (weighted: make/model > city >
  description) with a GIN index powers full-text search without a
  separate search engine.
- `text_pattern_ops` functional indexes on `lower(make)`, `lower(model)`,
  `lower(location_city)` support fast case-insensitive prefix matching
  for autocomplete a plain B-tree index doesn't accelerate `LIKE
'term%'` under non-C locales.
- A composite `(created_at DESC, id DESC)` index backs cursor pagination,
  avoiding the "page 500 is slow" problem of offset pagination.

### Caching

Facet counts (`GET /filters`) run 6 `GROUP BY` queries. These are cached
in Redis with a 60-second TTL (cache-aside pattern) since facets shift
slowly relative to browse traffic. Cache invalidation on
create/update/delete is a `TODO` marked in `search.service.ts` for extra
freshness if needed.

## What's not yet implemented

- Auth/authorization (out of scope per the assessment brief, `seller_id`
  is a plain integer with no `users` table).
- Validation of `attributes` payload in `POST /listings` against
  `category_filter_attributes` for the given category (marked `TODO` in
  `listings.service.ts`).
- Facet cache invalidation on listing mutation.

## Deployment

Deployed to: https://automativemarketplace.onrender.com
