export interface SharedUser {
  readonly id: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export type SharedSession =
  | Readonly<{ status: 'anonymous'; user: null }>
  | Readonly<{ status: 'authenticated'; user: SharedUser }>;

export interface AuthAdapter {
  getSession?(): Promise<unknown>;
  signIn?(input: { returnTo: string; [key: string]: unknown }): Promise<unknown>;
  signOut?(): Promise<void>;
  subscribe?(listener: (session: unknown) => void): (() => void) | void;
}

export interface AuthClient {
  getSession(): SharedSession;
  refresh(): Promise<SharedSession>;
  signIn(input?: { returnTo?: string; [key: string]: unknown }): Promise<unknown>;
  signOut(): Promise<SharedSession>;
  subscribe(listener: (session: SharedSession) => void): () => void;
  destroy(): void;
}

export const ANONYMOUS_SESSION: SharedSession;
export function assertSafeReturnTo(returnTo: string, currentOrigin: string): string;
export function createAuthClient(options?: {
  adapter?: AuthAdapter;
  currentOrigin?: string;
}): AuthClient;
