import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { SlidingWindowCounter } from "../../dist/index.js";

class RateLimited extends Error {}

const app = express();
const port = 8080;
const limiter = SlidingWindowCounter.builder<string>()
  .setThreshold(3)
  .setRequests(2)
  .build();

app.get("/unlimited", (_req: Request, res: Response) => {
  res.send("Unlimited! Let's Go!");
});

app.use("/limited", (req: Request, _res: Response, next: NextFunction) => {
  if (limiter.declined(req.ip!)) {
    throw new RateLimited();
  }

  next();
});

app.get("/limited", (_req: Request, res: Response) => {
  res.send("Limited, don't over use me!");
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof RateLimited) {
    res.status(429).send("Relax, champ!");
  } else {
    res.status(500).send(`This one has escaped: ${err.message}`);
  }
});

app.listen(port, () => {
  console.log(`express app listening on port ${port}`);
});
