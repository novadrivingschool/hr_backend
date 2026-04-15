import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateHappyFormDto } from './dto/create-happy_form.dto';
import { UpdateHappyFormDto } from './dto/update-happy_form.dto';
import { HappyForm } from './entities/happy_form.entity';


@Injectable()
export class HappyFormService {
  constructor(
    @InjectRepository(HappyForm)
    private readonly happyFormRepository: Repository<HappyForm>,
  ) {}

  async create(createHappyFormDto: CreateHappyFormDto): Promise<HappyForm> {
    const newForm = this.happyFormRepository.create(createHappyFormDto);
    return await this.happyFormRepository.save(newForm);
  }

  async findAll(): Promise<HappyForm[]> {
    return await this.happyFormRepository.find();
  }

  async findOne(id: number): Promise<HappyForm> {
    const form = await this.happyFormRepository.findOne({ where: { id } });
    if (!form) {
      throw new NotFoundException(`HappyForm with ID #${id} not found`);
    }
    return form;
  }

  async update(id: number, updateHappyFormDto: UpdateHappyFormDto): Promise<HappyForm> {
    const form = await this.findOne(id);
    const updatedForm = Object.assign(form, updateHappyFormDto);
    return await this.happyFormRepository.save(updatedForm);
  }

  async remove(id: number): Promise<void> {
    const form = await this.findOne(id);
    await this.happyFormRepository.remove(form);
  }
}