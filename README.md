# endure

An easy to use rate limiting library in TypeScript that implements 4 different algorithms (see [here](https://bytebytego.com/courses/system-design-interview/design-a-rate-limiter) if you wanna know how they work):
- Token Bucket
- Fixed Window Counter
- Sliding Window Log
- Sliding Window Counter

## Example

```typescript
import { SlidingWindowLog } from "@franciscosbf/endure";

let limiter = SlidingWindowLog.builder<string>()
  .setThreshold(40)
  .setRequests(4)
  .build();

if (limiter.declined("192.168.1.1")) {
  // ...
}
```

## Installation

```sh
npm install @franciscosbf/endure
```
