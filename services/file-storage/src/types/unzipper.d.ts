declare module 'unzipper' {
  export interface Entry {
    path: string;
    type: string;
    uncompressedSize: number;
  }
  export interface CentralDirectory {
    files: Entry[];
  }
  export const Open: {
    buffer(data: Buffer): Promise<CentralDirectory>;
    file(path: string): Promise<CentralDirectory>;
  };
}
