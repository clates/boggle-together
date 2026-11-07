/** An RPC failure. `code` is the Postgres/PostgREST error code; it is empty when the request got no answer. */
export class RpcError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

/** True for a deliberate server answer (e.g. `Too late`, raised as P0001); false for network failures. */
export function isServerRejection(e: unknown): boolean {
  return e instanceof RpcError && e.code !== ''
}
