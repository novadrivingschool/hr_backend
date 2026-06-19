import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MulterModule } from '@nestjs/platform-express'
import { AssignmentRateType } from './entities/assignment-rate-type.entity'
import { AssignmentRateTypesService } from './assignment-rate-types.service'
import { AssignmentRateTypesController } from './assignment-rate-types.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentRateType]),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
  ],
  controllers: [AssignmentRateTypesController],
  providers: [AssignmentRateTypesService],
  exports: [AssignmentRateTypesService],
})
export class AssignmentRateTypesModule {}
