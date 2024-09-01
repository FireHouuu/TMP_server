import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TrademarkDocument = Trademark & Document;

@Schema()
export class Trademark {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  uid: string;

  @Prop({ required: true })
  similarity: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  findSameName: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  findSimilarName: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  findSimilarPronun: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  tokenize: any;

  @Prop({ type: MongooseSchema.Types.Mixed })
  checkElastic: any;
}

export const TrademarkSchema = SchemaFactory.createForClass(Trademark);
