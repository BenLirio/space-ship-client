// Generic WebSocket server message envelope
export interface ServerMessage<T = unknown> {
  type: string;
  payload: T;
}
