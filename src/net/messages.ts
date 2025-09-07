import { z } from "zod";
import type { RemoteShipSnapshot, ProjectileSnapshot } from "../types/state";

// Define schemas for server messages
const Connected = z.object({
  type: z.literal("connected"),
  payload: z.object({ id: z.string().min(1) }),
});

const Info = z.object({ type: z.literal("info"), payload: z.unknown() });

// New: per-IP ship generation quota
const ShipQuota = z.object({
  type: z.literal("shipQuota"),
  payload: z.object({
    remaining: z.number().int().nonnegative(),
    cap: z.number().int().positive(),
  }),
});

const GameState = z.object({
  type: z.literal("gameState"),
  payload: z.object({
    ships: z.record(
      z.object({
        physics: z.object({
          position: z.object({ x: z.number(), y: z.number() }),
          rotation: z.number(),
        }),
        appearance: z.object({ shipImageUrl: z.string() }),
        health: z.number(),
        kills: z.number(),
        name: z.string(),
      }) as unknown as z.ZodType<RemoteShipSnapshot>
    ),
    projectiles: z
      .array(
        z.object({
          id: z.string(),
          ownerId: z.string(),
          position: z.object({ x: z.number(), y: z.number() }),
          velocity: z.object({ x: z.number(), y: z.number() }),
          rotation: z.number(),
          createdAt: z.number(),
        }) as unknown as z.ZodType<ProjectileSnapshot>
      )
      .default([]),
  }),
});

const ErrorMsg = z.object({
  type: z.literal("error"),
  payload: z.unknown(),
});

// Scoreboard broadcast
const Scoreboard = z.object({
  type: z.literal("scoreboard"),
  payload: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        score: z.number(),
        shipImageUrl: z.string().optional(),
      })
    ),
    count: z.number(),
  }),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  Connected,
  Info,
  ShipQuota,
  GameState,
  Scoreboard,
  ErrorMsg,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseMessage(raw: unknown): ServerMessage | undefined {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ServerMessageSchema.parse(data);
  } catch {
    return undefined;
  }
}

// Tiny router utility
type HandlerMap = Partial<{
  connected: (msg: z.infer<typeof Connected>) => void;
  info: (msg: z.infer<typeof Info>) => void;
  shipQuota: (msg: z.infer<typeof ShipQuota>) => void;
  gameState: (msg: z.infer<typeof GameState>) => void;
  scoreboard: (msg: z.infer<typeof Scoreboard>) => void;
  error: (msg: z.infer<typeof ErrorMsg>) => void;
}>;

export function createRouter(map: HandlerMap) {
  return {
    dispatch(msg: ServerMessage) {
      const fn = (map as any)[msg.type];
      if (typeof fn === "function") fn(msg as any);
    },
  };
}
