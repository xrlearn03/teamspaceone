declare module 'apn' {
  export interface ProviderOptions {
    token?: {
      key: string | Buffer;
      keyId: string;
      teamId: string;
    };
    cert?: string | Buffer;
    key?: string | Buffer;
    production?: boolean;
  }

  export class Provider {
    constructor(options: ProviderOptions);
    send(notification: Notification, deviceTokens: string[]): Promise<{ sent: Array<{ device: string }>; failed: Array<{ device: string; response?: unknown }> }>;
    shutdown(): void;
  }

  export class Notification {
    aps: {
      alert?: { title?: string; body?: string } | string;
      badge?: number;
      sound?: string;
    } & Record<string, unknown>;
    payload: Record<string, unknown>;
    topic?: string;
    pushType?: string;
    collapseId?: string;
  }
}
