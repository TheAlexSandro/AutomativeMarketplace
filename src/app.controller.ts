import { Controller, Get, Redirect } from "@nestjs/common";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Redirect("/docs", 301)
  get() {
    return;
  }

  @Get("/ping")
  ping() {
    return this.appService.ping();
  }
}
