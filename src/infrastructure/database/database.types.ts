import { ColumnType, Generated, JSONColumnType } from "kysely";

export type ListingStatus = "available" | "pending" | "sold" | "removed";
export type TransmissionType = "manual" | "automatic" | "cvt" | "other";
export type FuelType = "petrol" | "diesel" | "electric" | "hybrid" | "other";
export type ConditionType = "new" | "used" | "certified_pre_owned";
export type AttributeType = "enum" | "range" | "boolean";

export interface CategoriesTable {
  id: Generated<number>;
  parent_id: number | null;
  name: string;
  slug: string;
  depth: number;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface CategoryClosureTable {
  ancestor_id: number;
  descendant_id: number;
  depth: number;
}

export interface FilterAttributesTable {
  id: Generated<number>;
  code: string;
  label: string;
  type: AttributeType;
  enum_options: JSONColumnType<string[]> | null;
  range_meta: JSONColumnType<{ unit: string; min: number; max: number }> | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface CategoryFilterAttributesTable {
  category_id: number;
  attribute_id: number;
  is_required: boolean;
  display_order: number;
}

export interface ListingsTable {
  id: Generated<number>;
  seller_id: number;
  category_id: number;
  make: string;
  model: string;
  year: number;
  mileage: number;
  price: string; // NUMERIC comes back as string from pg, cast in repository
  condition: ConditionType;
  transmission: TransmissionType;
  fuel_type: FuelType;
  color: string | null;
  location_city: string;
  location_lat: number | null;
  location_lng: number | null;
  status: ListingStatus;
  description: string | null;
  images: JSONColumnType<string[]>;
  // generated column - never insert/update it directly
  search_vector: ColumnType<unknown, never, never>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
  deleted_at: ColumnType<Date | null, never, string | null>;
}

export interface ListingAttributeValuesTable {
  id: Generated<number>;
  listing_id: number;
  attribute_id: number;
  value_text: string | null;
  value_numeric: string | null;
  value_boolean: boolean | null;
}

export interface Database {
  categories: CategoriesTable;
  category_closure: CategoryClosureTable;
  filter_attributes: FilterAttributesTable;
  category_filter_attributes: CategoryFilterAttributesTable;
  listings: ListingsTable;
  listing_attribute_values: ListingAttributeValuesTable;
}
