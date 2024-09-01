import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { retry, delay } from 'rxjs/operators';
import { Subject, Observable, firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Trademark } from './trademark.schema';
import { S3Service } from '../common/s3.service';
import { Express } from 'express';
import { MongoError } from 'mongodb';
import { TrademarkResults, TrademarkMessage } from '../types/trademark.types';

@Injectable()
export class TrademarkService implements OnModuleInit {
  private readonly logger = new Logger(TrademarkService.name);
  private resultsMap: Map<string, Subject<TrademarkResults>> = new Map();

  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    @InjectModel(Trademark.name) private trademarkModel: Model<Trademark>,
    private readonly s3Service: S3Service,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Kafka connection...');
    this.kafkaClient.subscribeToResponseOf('trademark-workers');
    this.kafkaClient.subscribeToResponseOf('trademark-results');
    await this.connectWithRetry();
  }
  
  //리더 선출 및 브로커 할당 등 기타 문제로 인한 연결 에러 발생시 연결 재시도
  private async connectWithRetry(retries = 5, interval = 5000) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.kafkaClient.connect();
        this.logger.log('Kafka connection established successfully');
        return;
      } catch (error) {
        this.logger.warn(`Failed to connect to Kafka. Retrying... (${i + 1}/${retries})`);
        if (i === retries - 1) {
          this.logger.error('Failed to connect to Kafka after multiple attempts', error.stack);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }
  //출원 상표 이미지 저장 및 Flask 서버로 입력값 전달 
  async checkNameAndUploadImage(name: string, product_name: string, file: Express.Multer.File, uid: string) {
    this.logger.log(`Checking trademark name and uploading image: ${name}`);
    try {
      const imageUrl = await this.s3Service.uploadFile(file);

      const message: TrademarkMessage = { name, product_name, uid, imageUrl };
      await firstValueFrom(this.kafkaClient.emit('trademark-workers', message)
        .pipe(
          retry(3),
          delay(1000)
        )
      );

      this.logger.log(`Trademark check for '${name}' initiated successfully`);
      return { message: `Trademark check for '${name}' initiated`, status: 'processing', imageUrl };
    } catch (error) {
      this.handleError(error, `Error checking trademark name and uploading image: ${name}`);
      throw error;
    }
  }

  //입력값에 대한 처리 결과 수신
  @MessagePattern('trademark-results')
  async handleTrademarkResults(@Payload() message: TrademarkMessage & { results: TrademarkResults }) {
    const { uid, name, product_name, results, imageUrl } = message;
    this.logger.log(`Received trademark results for ${name} (UID: ${uid})`);
    
    //결과값 mongoDB 저장
    try {
      const trademark = new this.trademarkModel({
        uid,
        name,
        product_name,
        results,
        imageUrl,
        createdAt: new Date(),
      });
      await trademark.save();
      this.logger.log(`Saved trademark results to MongoDB for ${name}`);

      if (this.resultsMap.has(uid)) {
        this.resultsMap.get(uid).next(results);
        this.logger.log(`Sent results to user ${uid}`);
      }
    } catch (error) {
      this.handleError(error, `Error handling trademark results for ${name}`);
    }
  }

  getResultsStream(uid: string): Observable<TrademarkResults> {
    if (!this.resultsMap.has(uid)) {
      this.resultsMap.set(uid, new Subject<TrademarkResults>());
    }
    return this.resultsMap.get(uid).asObservable();
  }

  //현재까지의 결과 내역 일체 조회
  async getTrademarksByUID(uid: string): Promise<Trademark[] | { message: string }> {
    try {
      const results = await this.trademarkModel.find({ uid }).exec();

      if (results.length === 0) {
        this.logger.log(`No trademarks found for UID ${uid}`);
        return { message: '저장된 상표 검토 결과가 없습니다.' };
      } else {
        this.logger.log(`Found ${results.length} trademarks for UID ${uid}`);
        return results;
      }
    } catch (error) {
      this.handleError(error, `Error retrieving trademarks for UID ${uid}`);
      throw error;
    }
  }

  private handleError(error: any, message: string) {
    if (error && error.code && error.message && typeof error.code === 'string') {
      this.logger.error(`AWS S3 error: ${error.code} - ${error.message}`);
    } else if (error instanceof MongoError) {
      this.logger.error(`MongoDB error: ${error.message}`);
    } else {
      this.logger.error(`Unexpected error: ${error.message}`);
    }
    this.logger.error(`${message}: ${error.stack}`);
  }
}