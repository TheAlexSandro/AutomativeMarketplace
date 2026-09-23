import { Injectable, NotFoundException } from "@nestjs/common";
import { ListingsRepository } from "./listings.repository";
import { QueryListingsDto } from "./dto/query-listings.dto";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";

@Injectable()
export class ListingsService {
  constructor(private readonly listingsRepository: ListingsRepository) {}

  findMany(query: QueryListingsDto) {
    return this.listingsRepository.findMany(query);
  }

  async findById(id: number) {
    const listing = await this.listingsRepository.findById(id);
    if (!listing) throw new NotFoundException(`Listing ${id} not found`);
    return listing;
  }

  search(term: string, limit?: number) {
    return this.listingsRepository.search(term, limit);
  }

  findByCategoryIds(categoryIds: number[]) {
    return this.listingsRepository.findByCategoryIds(categoryIds);
  }

  create(dto: CreateListingDto) {
    // TODO: validate dto.attributes against category_filter_attributes
    // for dto.categoryId before insert (fetch allowed attributes,
    // check types match enum/range/boolean).
    return this.listingsRepository.create(dto);
  }

  async update(id: number, dto: UpdateListingDto) {
    await this.findById(id);
    return this.listingsRepository.update(id, dto);
  }

  async softDelete(id: number) {
    await this.findById(id);
    return this.listingsRepository.softDelete(id);
  }
}
