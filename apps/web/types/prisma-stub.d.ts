declare module '@prisma/client' {
  export class PrismaClient {
    constructor(...args: any[]);
    user: {
      findUnique(args: any): Promise<any>;
      create(args: any): Promise<any>;
    };
    organization: {
      findMany(args?: any): Promise<any[]>;
      findUnique(args: any): Promise<any | null>;
      create(args: any): Promise<any>;
    };
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
  }
}
