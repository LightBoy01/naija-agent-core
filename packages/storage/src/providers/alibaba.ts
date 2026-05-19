import OSS from 'ali-oss';
import { StorageProvider } from '../interfaces.js';

export class AlibabaOSSProvider implements StorageProvider {
  name = 'alibaba-oss';
  private client: OSS;

  constructor(config: {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint?: string;
  }) {
    this.client = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      endpoint: config.endpoint,
      secure: true
    });
  }

  async upload(
    orgId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    metadata: Record<string, string> = {}
  ): Promise<string> {
    const path = `orgs/${orgId}/media/${fileName}`;
    
    const result = await this.client.put(path, buffer, {
      mime: mimeType,
      meta: {
        ...metadata,
        orgId,
        uploadedAt: new Date().toISOString()
      }
    });

    // DashScope and other tools usually need the direct URL
    return result.url;
  }

  async getSignedUrl(path: string): Promise<string> {
    // Alibaba OSS signatures are valid for up to 24h by default if using STS, 
    // but here we generate a standard signed URL.
    const url = this.client.signatureUrl(path, { expires: 3600 });
    return url;
  }
}
