import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  private readonly counters = new Map<string, Counter<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();

  onModuleInit() {
    collectDefaultMetrics({ register: this.registry });
  }

  counter(name: string, help: string, labelNames: string[] = []): Counter<string> {
    if (!this.counters.has(name)) {
      const counter = new Counter({ name, help, labelNames, registers: [this.registry] });
      this.counters.set(name, counter);
    }
    return this.counters.get(name)!;
  }

  histogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram<string> {
    if (!this.histograms.has(name)) {
      const h = new Histogram({
        name,
        help,
        labelNames,
        buckets,
        registers: [this.registry],
      });
      this.histograms.set(name, h);
    }
    return this.histograms.get(name)!;
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
