import { EndureException } from "./error";

export interface RateLimiter<V> {
  declined(victim: V): boolean;
}

export interface Builder<V> {
  build(): RateLimiter<V>;
}

abstract class BaseRateLimiter<V, E> implements RateLimiter<V> {
  protected victims: Map<V, E>;

  constructor() {
    this.victims = new Map();
  }

  public abstract declined(victim: V): boolean;
}

abstract class BaseWindowLimiter<V, E> extends BaseRateLimiter<V, E> {
  protected threshold: number;
  protected requests: number;

  constructor(threshold: number, requests: number) {
    if (threshold < 1) {
      throw new EndureException("threshold must be greater than zero");
    }
    if (requests < 1) {
      throw new EndureException("requests must be greater than zero");
    }

    super();

    this.threshold = threshold * 1000;
    this.requests = requests;
  }
}

class WindowLog {
  public event: number;
  public oldest: WindowLog | undefined;

  constructor(event: number, oldest?: WindowLog) {
    this.event = event;
    this.oldest = oldest;
  }
}

abstract class BaseWindowLimiterBuilder<V> implements Builder<V> {
  protected threshold: number = 10;
  protected requests: number = 10;

  public abstract build(): RateLimiter<V>;
}

export class SlidingWindowLog<V> extends BaseWindowLimiter<V, WindowLog> {
  public declined(victim: V): boolean {
    let current = Date.now();

    let window = this.victims.get(victim);
    if (window === undefined) {
      window = new WindowLog(current);
    } else {
      window = new WindowLog(current, window);
    }
    this.victims.set(victim, window);

    let logged = 1;
    for (
      ;
      window.oldest !== undefined &&
      current - window.oldest.event <= this.threshold;
      window = window.oldest
    ) {
      logged++;
    }
    window.oldest = undefined;

    console.log(window.event);

    return logged > this.requests;
  }

  public static builder<V>(): SlidingWindowLogBuilder<V> {
    return new SlidingWindowLogBuilder<V>();
  }
}

export class SlidingWindowLogBuilder<V> extends BaseWindowLimiterBuilder<V> {
  public setThreshold(threshold: number): this {
    this.threshold = threshold;

    return this;
  }

  public setRequests(requests: number): this {
    this.requests = requests;

    return this;
  }

  public build(): RateLimiter<V> {
    return new SlidingWindowLog<V>(this.threshold, this.requests);
  }
}

class ShifftedWindowLog {
  public start: number;
  public log: WindowLog;

  constructor(start: number) {
    this.start = start;
    this.log = new WindowLog(start);
  }
}

export class SlidingWindowCounter<V> extends BaseWindowLimiter<
  V,
  ShifftedWindowLog
> {
  public declined(victim: V): boolean {
    let current = Date.now();

    let window = this.victims.get(victim);
    if (window === undefined) {
      window = new ShifftedWindowLog(current);
      this.victims.set(victim, window);
    } else {
      window.log = new WindowLog(current, window.log);
    }

    let passed = current - window.start;
    if (passed > this.threshold) {
      let offset = Math.trunc(passed / this.threshold) * this.threshold;
      window.start += offset;
      passed = current - window.start;
    }

    let log = window.log;

    let currentLogged = 1;
    for (
      ;
      log.oldest !== undefined && log.oldest.event >= window.start;
      log = log.oldest
    ) {
      currentLogged++;
    }

    let prevLogged = 0;
    let overlap = 1 - passed / this.threshold;
    let oThreshold = this.threshold * overlap;
    let olimit = window.start - oThreshold;
    for (
      ;
      log.oldest !== undefined && log.oldest.event >= olimit;
      log = log.oldest
    ) {
      prevLogged++;
    }
    log.oldest = undefined;

    let logged = Math.trunc(currentLogged + prevLogged * overlap);

    return logged > this.requests;
  }

  public static builder<V>(): SlidingWindowCounterBuilder<V> {
    return new SlidingWindowCounterBuilder<V>();
  }
}

export class SlidingWindowCounterBuilder<
  V,
> extends BaseWindowLimiterBuilder<V> {
  public setThreshold(threshold: number): this {
    this.threshold = threshold;

    return this;
  }

  public setRequests(requests: number): this {
    this.requests = requests;

    return this;
  }

  public build(): RateLimiter<V> {
    return new SlidingWindowCounter<V>(this.threshold, this.requests);
  }
}

class WindowCounter {
  public counter: number = 0;
  public start: number;

  constructor(start: number) {
    this.start = start;
  }
}

export class FixedWindowCounter<V> extends BaseWindowLimiter<V, WindowCounter> {
  public declined(victim: V): boolean {
    let current = Date.now();

    let window = this.victims.get(victim);
    if (window === undefined) {
      window = new WindowCounter(current);
      this.victims.set(victim, window);
    }

    let passed = current - window.start;
    if (passed > this.threshold) {
      let offset = Math.trunc(passed / this.threshold) * this.threshold;
      window.start += offset;
      window.counter = 0;

      return false;
    }

    let counter = window.counter + 1;
    window.counter = Math.min(this.requests, counter);

    return counter > this.requests;
  }

  public static builder<V>(): FixedWindowCounterBuilder<V> {
    return new FixedWindowCounterBuilder<V>();
  }
}

export class FixedWindowCounterBuilder<V> extends BaseWindowLimiterBuilder<V> {
  public setThreshold(threshold: number): this {
    this.threshold = threshold;

    return this;
  }

  public setRequests(requests: number): this {
    this.requests = requests;

    return this;
  }

  public build(): RateLimiter<V> {
    return new FixedWindowCounter<V>(this.threshold, this.requests);
  }
}

class Bucket {
  public tokens: number;
  public last: number;

  constructor(tokens: number, last: number) {
    this.tokens = tokens;
    this.last = last;
  }
}

export class TokenBucket<V> extends BaseRateLimiter<V, Bucket> {
  private tokens: number;
  private period: number;

  constructor(tokens: number, period: number) {
    if (tokens < 1) {
      throw new EndureException("tokens must be greater than zero");
    }
    if (period < 1) {
      throw new EndureException("period must be greater than zero");
    }

    super();

    this.tokens = tokens;
    this.period = period * 1000;
  }

  public declined(victim: V): boolean {
    let current = Date.now();

    let bucket = this.victims.get(victim);
    if (bucket === undefined) {
      bucket = new Bucket(this.tokens, current);
      this.victims.set(victim, bucket);
    }

    let passed = current - bucket.last;
    let gained = Math.trunc(passed / this.period);
    let accumulated = Math.min(this.tokens, bucket.tokens + gained);
    let remaining = Math.max(0, accumulated - 1);

    bucket.tokens = remaining;
    bucket.last = current;

    return accumulated == 0;
  }

  public static builder<V>(): TokenBucketBuilder<V> {
    return new TokenBucketBuilder<V>();
  }
}

export class TokenBucketBuilder<V> implements Builder<V> {
  private tokens: number = 10;
  private period: number = 1;

  public setTokens(tokens: number): this {
    this.tokens = tokens;

    return this;
  }

  public setPeriod(period: number): this {
    this.period = period;

    return this;
  }

  public build(): RateLimiter<V> {
    return new TokenBucket<V>(this.tokens, this.period);
  }
}
