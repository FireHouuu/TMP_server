import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import admin from '../firebase-admin';

@Injectable()
export class FirebaseAuthMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req['user'] = decodedToken;
      } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
      }
    } else {
    }
    next();
  }
}
