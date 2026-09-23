import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { SearchService } from "./search.service";

@ApiTags("search")
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("listings/search")
  search(@Query("q") q?: string, @Query("limit") limit?: number) {
    return this.searchService.search(q, limit ? Number(limit) : undefined);
  }

  @Get("listings/search/suggest")
  suggest(@Query("q") q: string) {
    return this.searchService.suggest(q);
  }

  @Get("filters")
  getFacets() {
    return this.searchService.getFacetCounts();
  }
}
