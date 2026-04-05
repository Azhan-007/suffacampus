declare module "ws" {
  type RawData = string | Buffer | ArrayBuffer | Buffer[];
  type MessageHandler = (data: RawData) => void;

  interface WebSocket {
    readyState: number;
    send(data: string): void;
    on(event: "message", listener: MessageHandler): void;
    on(event: "close" | "error", listener: () => void): void;
  }

  export type { RawData };
  export default WebSocket;
}
