# Transaction importer contract

Transaction importers translate provider-specific source records into one
canonical `transactionImportActivity` record. Transactions consume canonical
activities for managed summaries and reference fields; provider tables remain
available for provider-specific ingestion, setup, and review workflows.

To add an importer:

1. Add its id to `TRANSACTION_IMPORTER_IDS` and to the provider enum on the
   canonical DynamoDB entity.
2. Implement `TransactionImporterAdapter` in `models/`. The adapter owns source
   normalization, versioned details validation, matching policy, and managed UI
   presentation. Its details schema must continue accepting every persisted
   `detailsVersion`, or explicitly migrate old versions before presentation.
3. Register the adapter in `transaction-importer-registry.ts`.
4. Normalize and synchronize the provider record whenever ingestion or
   reconciliation changes it. Do not store raw provider payloads in the
   canonical record; store only stable normalized fields in `detailsJson`.
5. Create or match transactions through the existing transaction services, then
   link the canonical activity to the surviving transaction.

The shared lifecycle automatically includes importer activities in workspace
sync, ledger transfer, reset scopes, transaction reads, deletion reopening, and
merge relinking. A merge rejects two different activities from the same
provider so provider identity cannot be lost.

`financialFingerprint` is the immutable financial identity for a provider
record. Reusing a provider record id with a changed fingerprint moves the
canonical activity to `needsReview`; it never silently rewrites the original
financial history.
