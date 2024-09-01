import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      //console.log('No token provided');
      throw new UnauthorizedException('No token provided');
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      request['user'] = decodedToken;
      //console.log('Token verified successfully');
      return true;
    } catch (error) {
      //console.log('Token verification failed:', error);
      if (error.code === 'auth/id-token-expired') {
        throw new UnauthorizedException('Token expired. Please get a fresh token and try again.');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
