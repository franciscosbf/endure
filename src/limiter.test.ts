import { test, expect, jest } from "@jest/globals";

import {
  FixedWindowCounter,
  RateLimiter,
  SlidingWindowCounter,
  SlidingWindowLog,
  TokenBucket,
} from "./limiter";

jest.useFakeTimers();

function declined(limiter: RateLimiter<string>, seconds: number): boolean {
  jest.setSystemTime(seconds * 1000);

  return limiter.declined("a");
}

test("SlidingWindowLog", () => {
  let limiter = SlidingWindowLog.builder<string>()
    .setThreshold(40)
    .setRequests(4)
    .build();

  [0, 20, 25, 30].forEach((seconds) =>
    expect(declined(limiter, seconds)).toBeFalsy(),
  );

  expect(declined(limiter, 31)).toBeTruthy();
  expect(declined(limiter, 60)).toBeTruthy();
  expect(declined(limiter, 66)).toBeFalsy();
});

test("SlidingWindowCounter", () => {
  let limiter = SlidingWindowCounter.builder<string>()
    .setThreshold(60)
    .setRequests(7)
    .build();

  [0, 20, 25, 30, 35, 40, 70, 72].forEach((seconds) =>
    expect(declined(limiter, seconds)).toBeFalsy(),
  );

  expect(declined(limiter, 78)).toBeFalsy();
  expect(declined(limiter, 79)).toBeFalsy();
  expect(declined(limiter, 80)).toBeTruthy();
  expect(declined(limiter, 96)).toBeFalsy();
});

test("FixedWindowCounter", () => {
  let limiter = FixedWindowCounter.builder<string>()
    .setThreshold(20)
    .setRequests(4)
    .build();

  [0, 5, 10, 19].forEach((seconds) =>
    expect(declined(limiter, seconds)).toBeFalsy(),
  );

  expect(declined(limiter, 20)).toBeTruthy();
  expect(declined(limiter, 21)).toBeFalsy();

  [22, 22, 38, 39].forEach((seconds) =>
    expect(declined(limiter, seconds)).toBeFalsy(),
  );

  expect(declined(limiter, 40)).toBeTruthy();
  expect(declined(limiter, 41)).toBeFalsy();
});

test("TokenBucket", () => {
  let limiter = TokenBucket.builder<string>()
    .setPeriod(20)
    .setTokens(4)
    .build();

  [0, 5, 10, 20].forEach((seconds) =>
    expect(declined(limiter, seconds)).toBeFalsy(),
  );

  expect(declined(limiter, 21)).toBeTruthy();
  expect(declined(limiter, 41)).toBeFalsy();
  expect(declined(limiter, 42)).toBeTruthy();
  expect(declined(limiter, 82)).toBeFalsy();
  expect(declined(limiter, 83)).toBeFalsy();
  expect(declined(limiter, 90)).toBeTruthy();
  expect(declined(limiter, 102)).toBeTruthy();
  expect(declined(limiter, 122)).toBeFalsy();
});
