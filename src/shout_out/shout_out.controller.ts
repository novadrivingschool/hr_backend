import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ShoutOutService } from './shout_out.service';
import { CreateShoutOutDto } from './dto/create-shout_out.dto';
import { UpdateShoutOutDto } from './dto/update-shout_out.dto';

@Controller('shout-out')
export class ShoutOutController {
  constructor(private readonly shoutOutService: ShoutOutService) { }

  @Post()
  create(@Body() createShoutOutDto: CreateShoutOutDto) {
    return this.shoutOutService.create(createShoutOutDto);
  }

  @Get()
  findAll() {
    return this.shoutOutService.findAll();
  }

  @Get(':uuid')
  findOne(@Param('uuid') uuid: string) {
    return this.shoutOutService.findOne(uuid);
  }

  @Patch(':uuid')
  update(@Param('uuid') uuid: string, @Body() updateShoutOutDto: UpdateShoutOutDto) {
    return this.shoutOutService.update(uuid, updateShoutOutDto);
  }

  @Delete(':uuid')
  remove(@Param('uuid') uuid: string) {
    return this.shoutOutService.remove(uuid);
  }
}
