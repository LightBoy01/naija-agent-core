import COS from 'cos-nodejs-sdk-v5';
import { StorageProvider } from '../interfaces.js';

export interface TencentConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  accelerate?: boolean;
}

export class TencentCOSProvider implements StorageProvider {
  name = 'tencent-cos';
  private cos: COS;
  private bucket: string;
  private region: string;
  private accelerate: boolean;

  constructor(config: TencentConfig) {
    this.cos = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
    });
    this.bucket = config.bucket;
    this.region = config.region;
    this.accelerate = config.accelerate || false;
  }

  async upload(
    orgId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    metadata: Record<string, string> = {}
  ): Promise<string> {
    const key = `orgs/${orgId}/media/${fileName}`;
    const maxRetries = 3;
    
    const attemptUpload = (retryCount: number): Promise<string> => {
      return new Promise((resolve, reject) => {
        this.cos.putObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          Headers: {
            'x-cos-meta-orgid': orgId,
            ...Object.fromEntries(
              Object.entries(metadata).map(([k, v]) => [`x-cos-meta-${k.toLowerCase()}`, v])
            )
          }
        }, async (err, data) => {
          if (err) {
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 1000;
              console.warn(`⚠️ Tencent COS Upload failed (Attempt ${retryCount + 1}), retrying in ${delay}ms: ${err.message}`);
              setTimeout(() => {
                resolve(attemptUpload(retryCount + 1));
              }, delay);
            } else {
              return reject(new Error(`Tencent COS Upload Failed after ${maxRetries} retries: ${err.message}`));
            }
          } else {
            // Construct the URL. Use acceleration domain if enabled
            const domain = this.accelerate 
              ? `${this.bucket}.cos.accelerate.myqcloud.com`
              : `${this.bucket}.cos.${this.region}.myqcloud.com`;
              
            resolve(`https://${domain}/${key}`);
          }
        });
      });
    };

    return attemptUpload(0);
  }

  async getSignedUrl(path: string): Promise<string> {
    // If path is a full URL, extract the key
    const url = new URL(path);
    const key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl({
        Bucket: this.bucket,
        Region: this.region,
        Key: key,
        Sign: true,
        Expires: 3600 // 1 hour
      }, (err, data) => {
        if (err) return reject(err);
        
        let signedUrl = data.Url;
        
        // If acceleration is enabled, swap the domain in the signed URL
        if (this.accelerate) {
           signedUrl = signedUrl.replace(
             `${this.bucket}.cos.${this.region}.myqcloud.com`,
             `${this.bucket}.cos.accelerate.myqcloud.com`
           );
        }
        
        resolve(signedUrl);
      });
    });
  }
}
