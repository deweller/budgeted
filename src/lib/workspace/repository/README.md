# Workspace Repository

The workspace repository is a complete IndexedDB replica of server-authoritative
workspace state. It supports immediate cached reads but is not an offline
mutation authority.

Two versions are intentionally independent:

- `WORKSPACE_CACHE_DATABASE_VERSION` controls physical IndexedDB migrations in
  `schema.ts`. Increment it when stores, indexes, or key paths change.
- `WORKSPACE_CACHE_SCHEMA_VERSION` controls the logical cached-record contract.
  Increment it when existing records can no longer be trusted even if
  the physical IndexedDB shape remains compatible.

The database contains only minimal workspace version metadata and canonical
normalized records. Full replacement and incremental commit application update
records and metadata in one IndexedDB transaction, so the persisted cursor can
never advance past the records it describes. Transactions and balances are
rebuilt from canonical parents, lines, postings, and sync records.

An IndexedDB failure does not change the outcome of an accepted server command.
The controller keeps the committed state in memory, disables persistence for the
session, and resumes from the last persisted cursor after the next reload.

Synchronization code depends on `WorkspaceRepository` from this package.
