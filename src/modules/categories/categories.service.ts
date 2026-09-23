import { Injectable, NotFoundException } from "@nestjs/common";
import { CategoriesRepository } from "./categories.repository";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

export interface CategoryNode {
  id: number;
  name: string;
  slug: string;
  depth: number;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  // Builds the nested tree in O(n) from one flat query result, using a
  // Map for parent lookups instead of nested loops.
  async getTree(): Promise<CategoryNode[]> {
    const flat = await this.categoriesRepository.findAllFlat();
    const nodeById = new Map<number, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const row of flat) {
      nodeById.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        depth: row.depth,
        children: [],
      });
    }

    for (const row of flat) {
      const node = nodeById.get(row.id)!;
      if (row.parent_id) {
        nodeById.get(row.parent_id)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async getById(id: number) {
    const category = await this.categoriesRepository.findById(id);
    if (!category) throw new NotFoundException(`Category ${id} not found`);

    const children = await this.categoriesRepository.findDirectChildren(id);
    return { ...category, children };
  }

  // Used by ListingsService to scope a category listing query to
  // "this category + all subcategories" via the closure table.
  async getDescendantIds(categoryId: number) {
    await this.getById(categoryId); // 404s if the category doesn't exist
    return this.categoriesRepository.findDescendantIds(categoryId);
  }

  async getFilterAttributes(categoryId: number) {
    await this.getById(categoryId);
    return this.categoriesRepository.findFilterAttributes(categoryId);
  }

  create(dto: CreateCategoryDto) {
    return this.categoriesRepository.create(dto);
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.getById(id);
    return this.categoriesRepository.update(id, dto);
  }
}
