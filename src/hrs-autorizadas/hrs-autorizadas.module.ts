import { Module } from '@nestjs/common'
import { HrsAutorizadasController } from './hrs-autorizadas.controller'

@Module({
  controllers: [HrsAutorizadasController],
})
export class HrsAutorizadasModule {}
