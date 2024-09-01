import { Module } from '@nestjs/common';
import { TrademarkService } from './trademark.service';
import { TrademarkController } from './trademark.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { Trademark, TrademarkSchema } from './trademark.schema';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'trademark-service',
            brokers: ['localhost:9092'],
          },
          consumer: {
            groupId: 'trademark-consumer-group',
          },
          subscribe: {
            fromBeginning: true,
          },
        },
      },
    ]),
    MongooseModule.forFeature([{ name: Trademark.name, schema: TrademarkSchema }]),
    CommonModule,
  ],
  providers: [TrademarkService],
  controllers: [TrademarkController],
})
export class TrademarkModule {}
