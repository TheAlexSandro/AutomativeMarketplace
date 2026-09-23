-- =====================================================================
-- Automotive Marketplace API — Database Schema (PostgreSQL)
-- Strategy notes:
--   - Categories: adjacency list (parent_id) + closure table for
--     O(1) ancestor/descendant lookups on arbitrary-depth trees.
--   - Filter attributes: EAV pattern, scoped per category, typed
--     (enum | range | boolean) so the frontend can render dynamic
--     filter UIs without hardcoding per-vehicle-type fields.
--   - Full-text search: tsvector column + GIN index on listings.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATEGORIES (hierarchical, arbitrary depth)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id          BIGSERIAL PRIMARY KEY,
    parent_id   BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    depth       SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent_id ON categories(parent_id);

-- Closure table: every (ancestor, descendant) pair, including self
-- (depth = 0). Enables "get all descendants" / "get all ancestors"
-- in a single indexed lookup — critical for
-- GET /categories/:id/listings scoping to subcategories.
CREATE TABLE category_closure (
    ancestor_id     BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    descendant_id   BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    depth           SMALLINT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_closure_descendant ON category_closure(descendant_id);
CREATE INDEX idx_closure_ancestor ON category_closure(ancestor_id);

-- Trigger to auto-maintain closure table on category insert.
-- (On delete: ON DELETE CASCADE above handles cleanup. On re-parent
--  (update), the app layer should rebuild affected closure rows —
--  rare operation, safe to handle in application code.)
CREATE OR REPLACE FUNCTION fn_category_closure_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- self-reference
    INSERT INTO category_closure (ancestor_id, descendant_id, depth)
    VALUES (NEW.id, NEW.id, 0);

    -- inherit all ancestors of the parent
    IF NEW.parent_id IS NOT NULL THEN
        INSERT INTO category_closure (ancestor_id, descendant_id, depth)
        SELECT ancestor_id, NEW.id, depth + 1
        FROM category_closure
        WHERE descendant_id = NEW.parent_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_closure_insert
AFTER INSERT ON categories
FOR EACH ROW EXECUTE FUNCTION fn_category_closure_insert();

-- ---------------------------------------------------------------------
-- FILTER ATTRIBUTES (dynamic, category-scoped, typed)
-- ---------------------------------------------------------------------
CREATE TYPE attribute_type AS ENUM ('enum', 'range', 'boolean');

CREATE TABLE filter_attributes (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(60) NOT NULL UNIQUE,   -- e.g. 'fuel_type'
    label           VARCHAR(100) NOT NULL,          -- e.g. 'Fuel Type'
    type            attribute_type NOT NULL,
    -- for type='enum': allowed values, e.g. ["petrol","diesel","electric"]
    enum_options    JSONB,
    -- for type='range': unit hint, e.g. {"unit": "km", "min": 0, "max": 500000}
    range_meta      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which attributes apply to which category (many-to-many), so
-- 'fuel_type' can be attached to Cars but not Motorcycles.
CREATE TABLE category_filter_attributes (
    category_id     BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    attribute_id    BIGINT NOT NULL REFERENCES filter_attributes(id) ON DELETE CASCADE,
    is_required     BOOLEAN NOT NULL DEFAULT false,
    display_order   SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (category_id, attribute_id)
);

-- ---------------------------------------------------------------------
-- VEHICLE LISTINGS (core entity)
-- ---------------------------------------------------------------------
CREATE TYPE listing_status AS ENUM ('available', 'pending', 'sold', 'removed');
CREATE TYPE transmission_type AS ENUM ('manual', 'automatic', 'cvt', 'other');
CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'electric', 'hybrid', 'other');
CREATE TYPE condition_type AS ENUM ('new', 'used', 'certified_pre_owned');

CREATE TABLE listings (
    id              BIGSERIAL PRIMARY KEY,
    seller_id       BIGINT NOT NULL,               -- FK to users table (out of scope here)
    category_id     BIGINT NOT NULL REFERENCES categories(id),

    make            VARCHAR(80) NOT NULL,
    model           VARCHAR(80) NOT NULL,
    year            SMALLINT NOT NULL,
    mileage         INTEGER NOT NULL DEFAULT 0,
    price           NUMERIC(14,2) NOT NULL,
    condition       condition_type NOT NULL,
    transmission    transmission_type NOT NULL,
    fuel_type       fuel_type NOT NULL,
    color           VARCHAR(40),
    location_city   VARCHAR(100) NOT NULL,
    location_lat    DOUBLE PRECISION,
    location_lng    DOUBLE PRECISION,
    status          listing_status NOT NULL DEFAULT 'available',

    description     TEXT,
    images          JSONB NOT NULL DEFAULT '[]',   -- array of image URLs

    -- generated tsvector for full-text search over make/model/description
    search_vector   TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(make, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(model, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(location_city, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(description, '')), 'C')
    ) STORED,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ                       -- soft-delete marker
);

-- Common filter columns
CREATE INDEX idx_listings_category ON listings(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_status ON listings(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_make_model ON listings(make, model) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_price ON listings(price) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_year ON listings(year) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_fuel_type ON listings(fuel_type) WHERE deleted_at IS NULL;

-- Cursor pagination support: composite index on (created_at, id)
CREATE INDEX idx_listings_cursor ON listings(created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- Full-text search index
CREATE INDEX idx_listings_search_vector ON listings USING GIN(search_vector);

-- Composite index for the most common combined filter
-- (make + price range + year) to speed up faceted search
CREATE INDEX idx_listings_multi_filter ON listings(make, year, price) WHERE deleted_at IS NULL;

-- Functional lower() indexes for case-insensitive prefix search
-- (autocomplete on make/model/city — GET /listings/search/suggest).
-- text_pattern_ops makes LIKE 'term%' use the index (default btree
-- opclass only helps with '=' under some locales, not prefix LIKE).
CREATE INDEX idx_listings_make_lower ON listings(lower(make) text_pattern_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_model_lower ON listings(lower(model) text_pattern_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_listings_city_lower ON listings(lower(location_city) text_pattern_ops) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- LISTING ATTRIBUTE VALUES (EAV — dynamic per-category attributes)
-- ---------------------------------------------------------------------
CREATE TABLE listing_attribute_values (
    id              BIGSERIAL PRIMARY KEY,
    listing_id      BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    attribute_id    BIGINT NOT NULL REFERENCES filter_attributes(id) ON DELETE CASCADE,
    -- store as text; app layer casts based on filter_attributes.type
    value_text      TEXT,
    value_numeric   NUMERIC,   -- populated for 'range' type, enables numeric range queries
    value_boolean   BOOLEAN,   -- populated for 'boolean' type
    UNIQUE (listing_id, attribute_id)
);

CREATE INDEX idx_lav_listing ON listing_attribute_values(listing_id);
CREATE INDEX idx_lav_attribute_numeric ON listing_attribute_values(attribute_id, value_numeric);
CREATE INDEX idx_lav_attribute_text ON listing_attribute_values(attribute_id, value_text);

-- ---------------------------------------------------------------------
-- Trigger to keep updated_at fresh
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
