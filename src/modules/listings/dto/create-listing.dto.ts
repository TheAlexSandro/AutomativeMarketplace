import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateListingDto {
  @ApiProperty() @IsInt() sellerId: number;
  @ApiProperty() @IsInt() categoryId: number;
  @ApiProperty({ example: "Toyota" }) @IsString() make: string;
  @ApiProperty({ example: "Avanza" }) @IsString() model: string;
  @ApiProperty({ example: 2022 }) @IsInt() year: number;
  @ApiProperty({ example: 15000 }) @IsInt() @Min(0) mileage: number;
  @ApiProperty({ example: 215000000 }) @IsNumber() price: number;
  @ApiProperty({ enum: ["new", "used", "certified_pre_owned"] })
  @IsIn(["new", "used", "certified_pre_owned"])
  condition: string;
  @ApiProperty({ enum: ["manual", "automatic", "cvt", "other"] })
  @IsIn(["manual", "automatic", "cvt", "other"])
  transmission: string;
  @ApiProperty({ enum: ["petrol", "diesel", "electric", "hybrid", "other"] })
  @IsIn(["petrol", "diesel", "electric", "hybrid", "other"])
  fuelType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiProperty({ example: "Surabaya" }) @IsString() locationCity: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];
  @ApiPropertyOptional({
    description:
      'Dynamic per-category attributes, e.g. { "seating_capacity": 7, "has_sunroof": true }',
  })
  @IsOptional()
  attributes?: Record<string, string | number | boolean>;
}
