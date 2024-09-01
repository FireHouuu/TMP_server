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

  @Sse('results')
  @UseGuards(FirebaseAuthGuard)
  sendResults(@Req() req): Observable<MessageEvent> {
    const uid = req.user.uid;
    return this.trademarkService.getResultsStream(uid).pipe(
      map((data) => ({ data }))
    );
  }

  @Get('my_trademarks')
  @UseGuards(FirebaseAuthGuard)
  async getMyTrademarks(@Req() req) {
    const uid = req.user.uid;
    return this.trademarkService.getTrademarksByUID(uid);
  }
}
