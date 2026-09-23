import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_INSTANCE } from "../../infrastructure/redis/redis.provider";
import { SearchRepository } from "./search.repository";
import { ListingsRepository } from "../listings/listings.repository";

const FACETS_CACHE_KEY = "search:facets:v1";
const FACETS_TTL_SECONDS = 60; // short TTL: facets shift as listings are created/sold

@Injectable()
export class SearchService {
  constructor(
    private readonly searchRepository: SearchRepository,
    private readonly listingsRepository: ListingsRepository,
    @Inject(REDIS_INSTANCE) private readonly redis: Redis,
  ) {}

  suggest(term: string) {
    if (!term || term.trim().length < 2) {
      return { makes: [], models: [], cities: [] };
    }
    return this.searchRepository.suggest(term.trim());
  }

  // GET /listings/search delegates the actual filtered query to
  // ListingsRepository (already handles make/price/year/fuelType/cursor);
  // this layer just adds the full-text `q` term on top when present.
  async search(term: string | undefined, limit?: number) {
    if (term) {
      return this.listingsRepository.search(term, limit);
    }
    return this.listingsRepository.findMany({ limit });
  }

  // Cache-aside: try Redis first, fall back to the DB aggregation queries,
  // then repopulate the cache. A short TTL keeps facet counts reasonably
  // fresh without recomputing 6 GROUP BY queries on every request.
  async getFacetCounts() {
    const cached = await this.redis.get(FACETS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const facets = await this.searchRepository.facetCounts();
    await this.redis.set(
      FACETS_CACHE_KEY,
      JSON.stringify(facets),
      "EX",
      FACETS_TTL_SECONDS,
    );
    return facets;
  }

  // Call this from ListingsService after create/update/soft-delete so
  // facet counts don't serve stale data for the full TTL window.
  async invalidateFacetCache() {
    await this.redis.del(FACETS_CACHE_KEY);
  }
}
