import { Controller, Post, Get, Body, Param, UseGuards, Req, Sse, UseInterceptors, UploadedFile } from '@nestjs/common';
import { TrademarkService } from './trademark.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Observable, map } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { Express } from 'express';

@Controller('trademark')
export class TrademarkController {
  constructor(private readonly trademarkService: TrademarkService) {}

  //사용자 입력 (이름, 상품이름, 출원상표 이미지)
  @Post('process_trademark')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async checkName(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ) {
    const { name, product_name } = req.body;
    const uid = req.user.uid;
    return this.trademarkService.checkNameAndUploadImage(name, product_name, file, uid);
  }

  //입력 결과 대기 (SSE)
  @Sse('results')
  @UseGuards(FirebaseAuthGuard)
  sendResults(@Req() req): Observable<MessageEvent> {
    const uid = req.user.uid;
    return this.trademarkService.getResultsStream(uid).pipe(
      map((data) => ({ data }))
    );
  }

  //결과 내역 조회
  @Get('my_trademarks')
  @UseGuards(FirebaseAuthGuard)
  async getMyTrademarks(@Req() req) {
    const uid = req.user.uid;
    return this.trademarkService.getTrademarksByUID(uid);
  }
}
