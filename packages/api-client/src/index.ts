export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => Promise<string | undefined>;
}

export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  private async headers(): Promise<Record<string, string>> {
    const token = await this.config.getToken?.();
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      headers: await this.headers(),
    });
    return this.handle<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
    });
    return this.handle<T>(res);
  }

  private async handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
}
