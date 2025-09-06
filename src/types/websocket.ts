// Generic WebSocket server message envelope
export interface ServerMessage<T = unknown> {
  type: string;
  payload: T;
}

// Scoreboard message structures
export interface ScoreboardItem {
  id: string;
  name: string;
  score: number;
  shipImageUrl: string;
  createdAt?: string;
}

export interface ScoreboardPayload {
  items: ScoreboardItem[];
}
