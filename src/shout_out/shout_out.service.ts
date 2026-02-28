import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateShoutOutDto } from './dto/create-shout_out.dto';
import { UpdateShoutOutDto } from './dto/update-shout_out.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShoutOut } from './entities/shout_out.entity';

@Injectable()
export class ShoutOutService {

  constructor(
    @InjectRepository(ShoutOut)
    private readonly shoutOutRepo: Repository<ShoutOut>
  ) { }

  private readonly logger = new Logger(ShoutOutService.name);

  async create(dto: CreateShoutOutDto) {
    try {
      this.logger.log('Creating shout out...');
      const result = await this.shoutOutRepo.save(dto);
      this.logger.log(`Saved record: ${result.uuid}`);
      return result;
    } catch (error) {
      this.logger.error(`Error creating shout out: ${error.message}`, error.stack);

      throw new InternalServerErrorException('Database save operation failed');
    }
  }

  async findAll() {
    try {
      this.logger.log('Getting all shout outs...');
      const result = await this.shoutOutRepo.find();
      this.logger.log(`Found ${result} records`)
      return result
    } catch (error) {
      this.logger.error('Error getting all shout outs', error.stack);
      throw new InternalServerErrorException('Could not retrieve shout outs');
    }
  }

  async findOne(uuid: string) {
    const result = await this.shoutOutRepo.findOneBy({ uuid });

    if (!result) {
      this.logger.warn(`Shout out with UUID ${uuid} not found`);
      throw new NotFoundException(`Shout out with UUID ${uuid} not found`);
    }

    this.logger.log(`Retrieved shout out ${uuid}`);
    return result;
  }


  async update(uuid: string, dto: UpdateShoutOutDto) {

    if (dto === undefined) {
      this.logger.error('Data is undefined, cannot update')
      throw new InternalServerErrorException('Data is undefined')
    }

    this.logger.log(`Updating record with UUID ${uuid}`)

    this.logger.log('Update data:', dto)
    try {

      const currentRecord = await this.findOne(uuid)


      const updateData = {
        ...currentRecord,
        ...dto,
        // reemplazar los campos solo si vienen
        sender: dto.sender ? { ...currentRecord.sender, ...dto.sender } : currentRecord.sender,
        person_to: dto.person_to ? { ...currentRecord.person_to, ...dto.person_to } : currentRecord.person_to
      }

      const result = await this.shoutOutRepo.update(uuid, updateData)

      if (result.affected === 0) return ('No records found to update')

      this.logger.log(`Shout out ${uuid} updated succesfully`)
      return `Shout out ${uuid} updated succesfully`

    } catch (error) {
      this.logger.error(`Error updating shout out ${uuid} `, error.stack);
      throw new InternalServerErrorException('Could not update shout out');
    }

  }

  async remove(uuid: string) {
    this.logger.log(`Deleting record ${uuid}...`)
    try {
      const result = await this.shoutOutRepo.delete(uuid)
      if (result.affected === 0) {
        this.logger.warn(`Record ${uuid} could not be deleted`)
      }

      this.logger.log(`Shout out ${uuid} deleted succesfully`)
      return `Shout out ${uuid} deleted succesfully`


    } catch (error) {
      this.logger.error(`Error deleting shout out ${uuid}`, error.stack)
      throw new InternalServerErrorException('Could not delete shout out');
    }



  }
}




