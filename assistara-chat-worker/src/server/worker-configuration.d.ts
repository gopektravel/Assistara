/// <reference types="@cloudflare/workers-types" />

interface Env {
  CHAT_ROOM: DurableObjectNamespace<ChatRoom>;
  ASSETS: Fetcher;
}

declare class ChatRoom extends DurableObject<Env> {
  fetch(request: Request): Promise<Response>;
}

declare module "partysocket" {
  export interface PartySocketOptions {
    host?: string;
    party: string;
    room: string;
    onOpen?: (event: Event) => void;
    onMessage: (event: MessageEvent) => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (event: Event) => void;
  }

  export class PartySocket extends EventTarget {
    constructor(options: PartySocketOptions);
    send(data: string | ArrayBufferLike | Blob): void;
    close(): void;
    readyState: number;
  }

  export function usePartySocket(options: PartySocketOptions): PartySocket;
}

declare module "partyserver" {
  export interface Connection {
    id: string;
    send(data: string | ArrayBufferLike | Blob): void;
    close(): void;
  }

  export interface Server<Env = unknown> {
    new (ctx: DurableObjectState, env: Env): Server<Env>;
    ctx: DurableObjectState;
    env: Env;
    broadcast(data: string, exclude?: string[]): void;
    onStart?(): void | Promise<void>;
    onConnect?(connection: Connection): void | Promise<void>;
    onMessage?(connection: Connection, message: string | ArrayBuffer): void | Promise<void>;
    onClose?(connection: Connection): void | Promise<void>;
    onError?(connection: Connection, error: Error): void | Promise<void>;
  }

  export interface WSMessage extends string {}

  export function routePartykitRequest(request: Request, env: Env): Promise<Response | null>;
}