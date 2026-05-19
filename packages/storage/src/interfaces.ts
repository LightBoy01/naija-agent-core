export interface StorageProvider {
  name: string;
  upload(
    orgId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string,
    metadata?: Record<string, string>
  ): Promise<string>;
  getSignedUrl(path: string): Promise<string>;
}
