import net from "net";
import { config } from "../../config/env";
import { nowIso } from "../retail/retail-common";

export interface WorkflowQueueEvent {
  eventId: string;
  eventType: string;
  requestId: string;
  caseId?: string;
  status?: string;
  gateStatus?: string;
  actor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface RedisStreamConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  stream: string;
}

const defaultStreamName = "vaic:workflow-events";

const parseRedisStreamConfig = (): RedisStreamConfig | undefined => {
  if (!config.messageBrokerUrl) {
    return undefined;
  }

  const url = new URL(config.messageBrokerUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return undefined;
  }

  const database = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: Number.isFinite(database) ? database : undefined,
    stream: url.searchParams.get("stream") || process.env.WORKFLOW_STREAM_NAME || defaultStreamName,
  };
};

const encodeRedisCommand = (parts: string[]) =>
  `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;

const sendRedisCommand = (socket: net.Socket, parts: string[]) =>
  new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Redis command timed out: ${parts[0]}`));
    }, 5000);

    socket.once("data", (chunk) => {
      clearTimeout(timeout);
      const response = chunk.toString("utf8");
      if (response.startsWith("-")) {
        reject(new Error(response.slice(1).trim()));
        return;
      }
      resolve(response);
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.write(encodeRedisCommand(parts));
  });

const parseRedisStringReply = (response: string) => {
  if (response.startsWith("$")) {
    return response.split("\r\n")[1] ?? "";
  }

  if (response.startsWith("+")) {
    return response.slice(1).trim();
  }

  return response.trim();
};

const publishRedisStreamEvent = async (event: WorkflowQueueEvent, redis: RedisStreamConfig) =>
  new Promise<{ mode: "REDIS_STREAMS"; stream: string; brokerMessageId: string }>((resolve, reject) => {
    const socket = net.createConnection({ host: redis.host, port: redis.port }, async () => {
      try {
        if (redis.password) {
          await sendRedisCommand(socket, ["AUTH", redis.password]);
        }

        if (redis.database !== undefined) {
          await sendRedisCommand(socket, ["SELECT", String(redis.database)]);
        }

        const payload = JSON.stringify(event);
        const response = await sendRedisCommand(socket, [
          "XADD",
          redis.stream,
          "*",
          "eventId",
          event.eventId,
          "eventType",
          event.eventType,
          "requestId",
          event.requestId,
          "actor",
          event.actor,
          "timestamp",
          event.timestamp,
          "payload",
          payload,
        ]);
        socket.end();

        resolve({
          mode: "REDIS_STREAMS",
          stream: redis.stream,
          brokerMessageId: parseRedisStringReply(response),
        });
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    });

    socket.once("error", reject);
  });

export const getWorkflowQueueStatus = () => {
  const redis = parseRedisStreamConfig();
  const redisConfigured = Boolean(redis);
  return {
    backend: config.workflowStateBackend,
    brokerConfigured: Boolean(config.messageBrokerUrl),
    brokerType: redisConfigured ? "redis-streams" : config.messageBrokerUrl ? "unsupported" : "none",
    stream: redis?.stream,
    required: config.workflowQueueRequired,
    distributedReady: config.workflowStateBackend === "redis-streams" && redisConfigured,
    checkedAt: nowIso(),
  };
};

export const publishWorkflowEvent = async (event: WorkflowQueueEvent) => {
  const redis = parseRedisStreamConfig();
  if (config.workflowStateBackend !== "redis-streams" || !redis) {
    return {
      mode: "LOCAL_FILE_EVENT_LOG" as const,
      brokerMessageId: null,
    };
  }

  return publishRedisStreamEvent(event, redis);
};
