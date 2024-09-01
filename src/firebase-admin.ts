import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

let firebaseApp: admin.app.App;

export function initializeFirebase(configService: ConfigService): admin.app.App {
  if (!firebaseApp) {
    const serviceAccountPath = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccountPath)
    });
  }
  return firebaseApp;
}

export default admin;
