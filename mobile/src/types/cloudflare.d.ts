type D1Database = any;
interface R2Bucket {
  get(key: string): Promise<any>;
  list(options?: any): Promise<any>;
}
