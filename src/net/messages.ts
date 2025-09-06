import { z } from "zod";
import type { RemoteShipSnapshot, ProjectileSnapshot } from "../types/state";
import type { ScoreboardPayload } from "../types/websocket";

// Define schemas for server messages
const Connected = z.object({
  type: z.literal("connected"),
  payload: z.object({ id: z.string().min(1) }),
});

const Info = z.object({ type: z.literal("info"), payload: z.unknown() });

const GameState = z.object({
  type: z.literal("gameState"),
  payload: z.object({
    ships: z.record(
      z.object({
        physics: z.object({
          position: z.object({ x: z.number(), y: z.number() }),
          rotation: z.number(),
        }),
        appearance: z
          .object({ shipImageUrl: z.string().optional() })
          .partial()
          .optional(),
        health: z.number().optional(),
        kills: z.number().optional(),
        name: z.string().optional(),
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

const Scoreboard = z.object({
  type: z.literal("scoreboard"),
  payload: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string().default(""),
        score: z.number().default(0),
        shipImageUrl: z.string().default(""),
        createdAt: z.string().optional(),
      })
    ),
  }) as unknown as z.ZodType<ScoreboardPayload>,
});

const ErrorMsg = z.object({
  type: z.literal("error"),
  payload: z.unknown(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  Connected,
  Info,
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
