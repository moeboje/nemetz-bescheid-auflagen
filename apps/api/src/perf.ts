import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "./config.js";

type PerfConfig = Pick<AppConfig, "perfLoggingEnabled" | "nodeEnv">;

type ActiveRequest = {
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
  startedIso: string;
  thresholdsLogged: Set<number>;
  timers: NodeJS.Timeout[];
};

type RequestPerfContext = {
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
};

const requestContexts = new WeakMap<Request, RequestPerfContext>();
const activeRequests = new Map<string, ActiveRequest>();
const stillRunningThresholdsMs = [10_000, 30_000, 60_000, 120_000, 180_000, 220_000] as const;
let runtimeLoggingStarted = false;

function roundMs(value: number) {
  return Math.round(value);
}

function nsToMs(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value / 1_000_000);
}

function writePerfLog(payload: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...payload })}\n`);
}

function normalizePath(req: Request) {
  const path = req.path || req.originalUrl.split("?")[0] || "/";
  return path.length > 240 ? `${path.slice(0, 240)}...` : path;
}

function normalizeRequestId(value: unknown) {
  if (typeof value !== "string") {
    return randomUUID();
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(trimmed)) {
    return randomUUID();
  }
  return trimmed;
}

function classifyDuration(durationMs: number) {
  if (durationMs >= 220_000) {
    return "azure ingress timeout likely soon";
  }
  if (durationMs >= 120_000) {
    return "near timeout";
  }
  if (durationMs >= 30_000) {
    return "critical";
  }
  if (durationMs >= 10_000) {
    return "very slow";
  }
  if (durationMs >= 1_000) {
    return "slow";
  }
  return "ok";
}

function safeErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message ? error.message.slice(0, 160) : undefined
    };
  }
  return {
    name: typeof error
  };
}

export function isPerfLoggingEnabled(config: PerfConfig) {
  return config.perfLoggingEnabled === true;
}

export function createPerfRequestMiddleware(config: PerfConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isPerfLoggingEnabled(config)) {
      next();
      return;
    }

    const requestId = normalizeRequestId(req.get("x-request-id"));
    const startedAt = performance.now();
    const method = req.method;
    const path = normalizePath(req);
    const active: ActiveRequest = {
      requestId,
      method,
      path,
      startedAt,
      startedIso: new Date().toISOString(),
      thresholdsLogged: new Set<number>(),
      timers: []
    };

    requestContexts.set(req, { requestId, method, path, startedAt });
    activeRequests.set(requestId, active);
    res.setHeader("X-Request-Id", requestId);

    writePerfLog({
      event: "perf.request.start",
      requestId,
      method,
      path,
      activeRequestCount: activeRequests.size
    });

    let finished = false;
    const finish = (event: "finish" | "close") => {
      if (finished) {
        return;
      }
      finished = true;
      activeRequests.delete(requestId);
      for (const timer of active.timers) {
        clearTimeout(timer);
      }
      const durationMs = roundMs(performance.now() - startedAt);
      writePerfLog({
        event: "perf.request.finish",
        finishEvent: event,
        requestId,
        method,
        path,
        status: res.statusCode,
        durationMs,
        severity: classifyDuration(durationMs),
        activeRequestCount: activeRequests.size
      });
    };

    for (const thresholdMs of stillRunningThresholdsMs) {
      const timer = setTimeout(() => {
        if (!activeRequests.has(requestId) || active.thresholdsLogged.has(thresholdMs)) {
          return;
        }
        active.thresholdsLogged.add(thresholdMs);
        const durationMs = roundMs(performance.now() - startedAt);
        writePerfLog({
          event: "perf.request.still_running",
          requestId,
          method,
          path,
          durationMs,
          thresholdMs,
          severity: classifyDuration(durationMs),
          activeRequestCount: activeRequests.size,
          azureIngressTimeoutLikelySoon: thresholdMs >= 220_000 ? true : undefined
        });
      }, thresholdMs);
      timer.unref?.();
      active.timers.push(timer);
    }

    res.on("finish", () => finish("finish"));
    res.on("close", () => finish("close"));
    next();
  };
}

export function logPerfRequestError(config: PerfConfig, req: Request, res: Response, error: unknown) {
  if (!isPerfLoggingEnabled(config)) {
    return;
  }
  const context = requestContexts.get(req);
  const startedAt = context?.startedAt ?? performance.now();
  writePerfLog({
    event: "perf.request.error",
    requestId: context?.requestId,
    method: context?.method ?? req.method,
    path: context?.path ?? normalizePath(req),
    status: res.statusCode,
    durationMs: roundMs(performance.now() - startedAt),
    error: safeErrorSummary(error)
  });
}

export function createPerfTimer(config: PerfConfig, req: Request, flow: string) {
  const enabled = isPerfLoggingEnabled(config);
  const context = requestContexts.get(req);
  const requestId = context?.requestId;

  const measure = async <T>(step: string, callback: () => Promise<T>): Promise<T> => {
    if (!enabled) {
      return callback();
    }
    const startedAt = performance.now();
    try {
      return await callback();
    } finally {
      writePerfLog({
        event: "perf.step",
        requestId,
        flow,
        step,
        durationMs: roundMs(performance.now() - startedAt)
      });
    }
  };

  const mark = (step: string, metadata?: Record<string, unknown>) => {
    if (!enabled) {
      return;
    }
    writePerfLog({
      event: "perf.mark",
      requestId,
      flow,
      step,
      ...metadata
    });
  };

  return { enabled, mark, measure };
}

export async function measurePerfOperation<T>(
  config: PerfConfig,
  flow: string,
  step: string,
  callback: () => Promise<T>
): Promise<T> {
  if (!isPerfLoggingEnabled(config)) {
    return callback();
  }
  const startedAt = performance.now();
  try {
    return await callback();
  } finally {
    writePerfLog({
      event: "perf.operation",
      flow,
      step,
      durationMs: roundMs(performance.now() - startedAt)
    });
  }
}

export function startPerfRuntimeLogging(config: PerfConfig) {
  if (!isPerfLoggingEnabled(config) || runtimeLoggingStarted) {
    return;
  }
  runtimeLoggingStarted = true;

  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();

  const interval = setInterval(() => {
    const now = performance.now();
    const memory = process.memoryUsage();
    const oldestRequests = [...activeRequests.values()]
      .sort((left, right) => left.startedAt - right.startedAt)
      .slice(0, 5)
      .map((request) => ({
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        durationMs: roundMs(now - request.startedAt),
        startedAt: request.startedIso
      }));

    writePerfLog({
      event: "perf.runtime.snapshot",
      activeRequestCount: activeRequests.size,
      oldestRequests,
      eventLoopDelayMs: {
        mean: nsToMs(eventLoopDelay.mean),
        max: nsToMs(eventLoopDelay.max),
        p95: nsToMs(eventLoopDelay.percentile(95)),
        p99: nsToMs(eventLoopDelay.percentile(99))
      },
      process: {
        uptimeSec: Math.round(process.uptime()),
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        nodeEnv: config.nodeEnv
      }
    });
    eventLoopDelay.reset();
  }, 30_000);
  interval.unref?.();
}
