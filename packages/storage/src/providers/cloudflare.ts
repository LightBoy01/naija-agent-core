import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider } from '../interfaces.js';

export interface CloudflareR2Config {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  bucket: string;
  publicDomain?: string; // Optional custom domain or worker URL
}

export class CloudflareR2Provider implements StorageProvider {
  name = 'cloudflare-r2';
  private client: S3Client;
  private bucket: string;
  private publicDomain?: string;

  constructor(config: CloudflareR2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.publicDomain = config.publicDomain;
  }

  async upload(
    orgId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    metadata: Record<string, string> = {}
  ): Promise<string> {
    const key = `orgs/${orgId}/media/${fileName}`;
    
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          orgid: orgId,
          ...metadata,
        },
      })
    );

    // If a public domain is provided, use it. Otherwise, R2 doesn't provide a direct public URL 
    // without a custom domain or signed URL. We return the path for later signing if needed,
    // or the custom domain URL.
    if (this.publicDomain) {
      const baseUrl = this.publicDomain.startsWith('http') ? this.publicDomain : `https://${this.publicDomain}`;
      return `${baseUrl}/${key}`;
    }

    // Default: Return a "pseudo-URL" or the path. 
    // In our system, getSignedMediaUrl will handle this path.
    return `r2://${this.bucket}/${key}`;
  }

  async getSignedUrl(path: string): Promise<string> {
    // Extract key from r2://bucket/key or a full URL
    let key = path;
    if (path.startsWith('r2://')) {
        const parts = path.replace('r2://', '').split('/');
        parts.shift(); // remove bucket
        key = parts.join('/');
    } else if (path.startsWith('http')) {
        try {
            const url = new URL(path);
            key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        } catch (e) {}
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn: 3600 });
  }
}
