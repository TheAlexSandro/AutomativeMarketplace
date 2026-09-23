import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";
import { ListingsService } from "../listings/listings.service";

@ApiTags("categories")
@Controller()
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly listingsService: ListingsService,
  ) {}

  @Get("categories")
  getTree() {
    return this.categoriesService.getTree();
  }

  @Get("categories/:id")
  getOne(@Param("id", ParseIntPipe) id: number) {
    return this.categoriesService.getById(id);
  }

  // Scoped listings: this category + every subcategory, via closure table
  @Get("categories/:id/listings")
  async getListings(@Param("id", ParseIntPipe) id: number) {
    const descendantIds = await this.categoriesService.getDescendantIds(id);
    return this.listingsService.findByCategoryIds(descendantIds);
  }

  @Post("categories")
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch("categories/:id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Get("filters/:categoryId")
  getFilters(@Param("categoryId", ParseIntPipe) categoryId: number) {
    return this.categoriesService.getFilterAttributes(categoryId);
  }
}
