# Accounting in Budgeted

This document describes the accounting model currently implemented in Budgeted.
It is grounded in the code paths that build ledger postings, account balances,
budget period summaries, imports, and integrity diagnostics.

Budgeted has two related accounting layers:

- Account accounting: where money is, based on financial accounts and balanced
  ledger postings.
- Budget allocation accounting: what the money is reserved for, based on
  category assignments, category activity, and projected opening-balance funding.

The ledger remains the source of truth for account balances and transaction
activity. Monthly budget values are projections over ledger, account, and
allocation records.

## Source Of Truth

The primary persisted accounting records are:

- `account`
  - Stores the real financial/tracking account metadata.
  - Stores `openingBalanceCents`.
  - Stores `openedOn`, which determines the month where opening-balance funding
    is projected into allocation reconciliation.
- `transaction`
  - Stores date, status, kind, source, reference account, reference category,
    and display amount.
- `transactionLine`
  - Stores the user-facing transaction line shape: account movement,
    category, memo, payee, and amount.
- `ledgerPosting`
  - Stores the balanced double-entry rows generated from transaction lines.
- `categoryAllocation`
  - Stores month/category assignment state.
  - Authoritative current field: `assignedCents`.
- `allocationFundingSource`
  - Stores auto-assign provenance between categories.
  - It explains assignment movement but is not account activity and does not
    create ledger postings.

There is no database-level category opening balance entity in the current model.
There are also no new persisted starting-balance transactions. Account opening
balances remain account state.

## Workspace Caching And Consistency

The browser cache is a local replica and performance optimization. It is not an
accounting source of truth. DynamoDB records and their committed workspace
revision remain authoritative.

The implementation has explicit owners:

- `src/features/workspace/server/atomic-workspace-commit.ts`
  - Owns idempotent replay, revision allocation, mutation batches, workspace
    state, and the ledger revision fence for atomic writes.
- `src/features/workspace/server/workspace-sync-service.ts`
  - Owns authoritative snapshots and knowledge, retained revision queries, and
    workspace-state projection.
- `src/lib/workspace/workspace-protocol.ts`
  - Owns framework-independent cursor, knowledge, batch, hydration, and cached
    transaction-query rules shared by the server and browser.
- `src/lib/workspace/workspace-sync-controller.ts`
  - Owns client bootstrap, synchronization, cache serialization, committed
    mutation reconciliation, and snapshot recovery.
- `src/lib/workspace/repository`
  - Owns IndexedDB schema, records, routing indexes, aggregate validation,
    account balance projections, knowledge metadata, reads, atomic replacement,
    incremental application, and invalidation.
- `src/components/workspace/workspace-store-provider.tsx`
  - Adapts the controller to React and owns context, optimistic rendering,
    lifecycle triggers, and cross-tab wiring.
- `src/lib/workspace/change-transition.ts`
  - Verifies that an update or delete applies to the exact prior record observed
    by the server mutation.

Transaction server code follows the same ownership split:

- `transaction-query-service.ts` owns reads.
- `transaction-write-model.ts` owns aggregate construction and public records.
- `transaction-persistence.ts` owns transaction-family database items.
- `transaction-workspace-changes.ts` owns proof-bearing workspace changes.
- The save, categorize, delete, and merge services expose focused mutation use
  cases.
- `transaction-side-effects.ts` owns audit and classification follow-up work.

### Server Knowledge

Each ledger has an ordered workspace generation and revision. Public workspace
knowledge includes:

- The active ledger id.
- The current generation and revision cursor.
- Entity counts and content digests.
- Per-entity revision tokens.
- The oldest retained change revision.

The revision cursor identifies an ordered server commit. Counts and digests
prove the expected content at that cursor; the cursor alone is not treated as
proof that two workspace copies are equal.

Workspace change records are stored as complete revision batches. Every
revisioned change includes:

- Entity type, entity id, and upsert/delete operation.
- Batch id, change count, and change index.
- Workspace generation and revision.
- A prior-record proof.

For a new record, the prior-record proof is `null`, meaning the record must not
already exist. For an update or delete, it is the digest of the exact prior
record. A client applies a change only when its local prior state matches that
proof.

Change history is retained for 30 days. If a client cursor is absent, from a
different generation, older than retained history, or followed by an incomplete
or noncontiguous revision sequence, the server requires a full snapshot.

### IndexedDB Repository

Workspace records are cached in IndexedDB. Transactions are not stored in
`localStorage`.

The cache is scoped by owner and ledger and contains:

- Canonical workspace records.
- Workspace knowledge metadata.
- Transaction-family aggregate metadata.
- Transaction routing indexes for account, date, period, source, status,
  uncategorized state, and transaction id.
- Authenticated account balance projections.

Cached transaction metadata records the expected line, posting, and Plaid sync
record counts and digests for each transaction. The repository validates these
relationships and its routing indexes before returning a scoped transaction
result. This prevents a partial transaction family, stale index entry, or
misrouted transaction from being silently accepted.

Account balance projections are cached separately so account lists can render
without loading every posting into JavaScript. They are still derived values:

```text
opening balance + financial posting deltas
```

The cached projection is tied to the repository identity and workspace cursor
and has its own content digest. Posting changes update affected projections;
account-definition changes cause the relevant projection data to be rebuilt.
An invalid projection is discarded rather than treated as accounting truth.

### Startup And Transaction Loading

On a normal cached startup, the client can load configuration records and
authenticated account balance projections without materializing the entire
transaction history in React or embedding it in the page HTML.

Transaction views then query the IndexedDB repository for the required scope,
such as an account, period, source, status, uncategorized state, or transaction
id. The complete transaction repository remains covered by aggregate digests
even when only a subset is loaded into memory.

On first use, after cache invalidation, or when retained changes cannot bridge
the client's cursor to the server, the client downloads a complete snapshot to
seed the repository.

### Applying Server Changes

For an existing cache, synchronization follows this sequence:

1. Compare local and server workspace knowledge.
2. If cursor, counts, and digests agree, continue using the cache.
3. Otherwise request changes after the local revision.
4. Verify complete, ordered, contiguous revision batches.
5. Verify every change's prior-record proof against the local record.
6. Apply records, routing indexes, aggregates, and balance projections in one
   IndexedDB transaction.
7. Recompute the resulting counts and digests and compare them with
   authoritative server knowledge.
8. Publish the accepted state to the UI.

An interrupted IndexedDB update cannot leave a partially accepted revision
because record, index, projection, and metadata writes use the same database
transaction.

### Mutation Responses And Optimistic UI

Transaction create, update, delete, merge, categorize, and related Plaid
transaction paths return their committed workspace changes and authoritative
workspace knowledge directly. The server's hot transaction paths write domain
records, the workspace change batch, mutation receipt, workspace state, and
ledger revision fence atomically in DynamoDB.

Mutation ids and receipts make retries idempotent. The revision fence prevents
concurrent mutations from committing the same ledger revision.

The UI may display an optimistic overlay while a request is running. That
overlay is separate from the canonical cached snapshot. A mutation is not
accepted as durable client state until:

- The server response has a valid, complete change batch.
- The changes form the expected next revision sequence.
- IndexedDB accepts the transition proofs and resulting knowledge.

If the request or cache commit fails, the optimistic overlay is removed and the
client reconciles with the server.

The end-to-end mutation flow is:

1. A focused feature service validates and resolves the domain mutation.
2. The atomic commit coordinator writes domain records, a complete workspace
   mutation batch, mutation receipt, workspace state, and ledger revision fence
   in one DynamoDB transaction.
3. The route returns the feature result, committed changes, and authoritative
   knowledge in one standard mutation envelope.
4. The client mutation executor passes the response to the synchronization
   controller.
5. The controller verifies revision continuity and prior-record proofs, then
   asks the repository to commit records, indexes, aggregates, projections, and
   knowledge in one IndexedDB transaction.
6. React publishes the canonical result and removes the optimistic overlay.

Feature components do not write IndexedDB, advance cursors, or independently
interpret workspace batches.

### Recovery Guarantees

The client falls back to a full snapshot when it detects conditions such as:

- Ledger or workspace-generation mismatch.
- A cursor outside retained change history.
- Missing, duplicate, incomplete, or noncontiguous revision batches.
- A prior-record digest mismatch.
- Entity count or digest disagreement.
- Invalid transaction aggregates or routing indexes.
- Invalid account balance projection metadata.
- A malformed mutation response.

Snapshot recovery fetches an authoritative snapshot and any changes committed
after the snapshot's base cursor, verifies the combined result, and replaces
the IndexedDB repository atomically.

These mechanisms provide consistency detection and deterministic recovery; they
do not make the browser an offline write authority. If the browser cache is
missing or untrustworthy, the server snapshot is the recovery source.

## Ledger Posting Rules

Transaction line posting rules live in
`src/modules/ledger/posting-rules.ts`.

Every stored transaction must produce balanced postings:

```text
sum(debits) - sum(credits) = 0
```

Posting amounts must be positive cents values, and every ledger transaction must
include at least one financial account posting.

Posting deltas use:

```text
debit  = +amount
credit = -amount
```

The transaction line shapes map to postings like this:

| Line shape | Financial posting | Category/equity posting |
| --- | --- | --- |
| Spending from an account | Credit `fromAccount` | Debit category |
| Inflow to an account | Debit `toAccount` | Credit category |
| Transfer between accounts | Credit `fromAccount`, debit `toAccount` | None |

One-sided account lines must have a category. Transfers are the exception
because they only move money between financial accounts.

## Account Balances

Account balance math lives in
`src/modules/ledger/account-balance.ts` and is exposed through
`src/features/accounts/server/account-balance-service.ts`.

For a given account:

```text
account balance =
  openingBalanceCents
  + sum(financial posting deltas for that account)
```

When calculating as-of balances:

- If the account opens after the as-of date, its balance is zero.
- Only financial postings for that account are included.

Budgeted account types:

- Budget funding accounts: `cash`, `checking`, `savings`
- Budget category activity accounts: `cash`, `checking`, `savings`,
  `creditCard`, `transfers`
- Non-budget-funding account types: `transfers`, `tracking`
- `transfers` accounts are internal category-transfer clearing accounts. They
  always have a zero opening balance and do not provide budget funding, but
  categorized entries against them affect category activity.

Funding eligibility for current account totals is period-based: budget funding
accounts count when their `openedOn` date is on or before the period end.

## Category Activity

Category activity math lives in
`src/modules/budgeting/category-activity.ts`.

Category activity is calculated from transaction lines, not from stored
allocation rows.

A transaction line contributes to category activity only when:

- The transaction is in the selected period.
- The transaction is not voided.
- The transaction kind is not `adjustment`.
- The line has a valid category.
- The line is one-sided account activity, not an account-to-account transfer.
- The account type is a budget category activity type:
  `cash`, `checking`, `savings`, `creditCard`, or `transfers`.

Sign convention:

```text
line.toAccountId   => +amountCents
line.fromAccountId => -amountCents
```

Account-to-account transfers do not affect category activity because they only
move money between financial accounts. Categorized entries against a
`transfers` account do affect category activity; their purpose is to move
reserved money between budget categories without changing real account funds.

## Monthly Category Projection

Monthly category state is derived in
`src/modules/budgeting/period-allocation-state.ts`.

For each visible category in a period:

```text
Month Start = previous period computed Total, or 0 for the first projected month
Assigned    = stored categoryAllocation.assignedCents, or 0
Activity    = live category activity from transaction lines
Total       = Month Start + Assigned + Activity
```

The UI labels these as:

- `Month Start`
- `Assigned`
- `Activity`
- `Total`

The `Total` for one period becomes `Month Start` for the next period. This is a
projection; it is not stored as `carriedForwardCents` anymore.

The main monthly budget table shows real user-visible budget categories only.
The system-managed `startingBalances` category is hidden from the global plan
and monthly budget category table.

## Allocation Reconciliation

Budget period summary assembly lives in
`src/features/budget/models/budget-period-summary.ts`.

Opening-balance funding projection lives in
`src/modules/budgeting/opening-balance-funding.ts`.

For each period, Budgeted projects initial allocation funding from budget
funding accounts opened in that period:

```text
allocationFundingCents =
  sum(openingBalanceCents for cash/checking/savings accounts opened in period)
```

Budgeted then compares visible category assignments to that funding:

```text
assignedAllocationTotalCents =
  sum(assignedCents for visible monthly budget categories)

allocationDifferenceCents =
  allocationFundingCents - assignedAllocationTotalCents
```

Interpretation:

- `allocationDifferenceCents === 0`: projected opening funds and visible
  assignments reconcile.
- `allocationDifferenceCents > 0`: opening funds remain unassigned.
- `allocationDifferenceCents < 0`: visible assignments exceed projected opening
  funding for that period.

For compatibility with older UI and API fields, `availableToBudgetCents` and
`fundingReconciliationCents` currently carry the same value as
`allocationDifferenceCents`. They should not be treated as independent stored
accounting facts.

Opening-balance funding rows are projected rows. They are shown in allocation
details as system funding information, not stored category allocations and not
transactions.

## Allocation Saves

Manual allocation saves are handled by
`src/features/budget/server/allocation-service.ts`.

Saving monthly allocations writes one `categoryAllocation` row per assignable
category:

```text
allocationId = periodId + ":" + categoryId
assignedCents = user-entered assignment
```

The save path writes assignment state only. Month start, activity, and total are
recomputed when summaries are read.

Resetting monthly assignments deletes saved `categoryAllocation` rows and
auto-assign funding-source rows for that period. It does not delete transactions,
account balances, opening balances, or category history implied by ledger
activity.

## Auto-Assign

Auto-assign planning lives in `src/modules/budgeting/auto-assign.ts`.

Auto-assign does not pull from a synthetic unassigned bucket. It uses the
configured auto-assign source categories in order. Source category available
amounts are derived from the same monthly projection described above.

Auto-assign writes:

- Updated category assignments.
- `allocationFundingSource` provenance rows showing which source categories
  funded destination assignment increases.

It does not create transactions or ledger postings.

## Budget Plan Defaults

Budget plan category defaults are reusable setup, not accounting movement by
themselves.

Budget plan cadence logic lives in
`src/modules/budgeting/allocation-schedule.ts`.

- Monthly categories use their default amount every month when applied.
- Yearly categories use their full amount only in the configured start month.

Saving the global budget plan changes defaults and category metadata. Monthly
assignment rows remain month-specific state.

## Import Behavior

YNAB import planning lives in `src/features/import/ynab/planner.ts`.

The importer:

- Creates account records with `openingBalanceCents` from imported starting
  balance rows.
- Creates budget groups and categories from the imported budget plan.
- Creates monthly `categoryAllocation` rows with `assignedCents`.
- Creates transaction, transaction-line, and ledger-posting records for real
  imported activity.

For imported monthly assignments:

- The first imported month uses the imported YNAB assigned values.
- Later months use the Budgeted budget-plan effective default amount for that
  category/month.

The importer does not create category opening-balance records. It also does not
create starting-balance transactions for the current model.

## Unassigned

`__unassigned__` is a UI/reporting concept, not a real budget category row in
the monthly category table.

In monthly budget allocation controls, the relevant value is the allocation
difference:

```text
Initial funds - Assigned
```

Positive means opening funds remain unassigned, zero means they reconcile, and
negative means assignments exceed the period's projected opening funding.

The category detail report includes an Unassigned option for explaining net
assignment movement. It is separate from the real category table.

## Integrity Checks

Ledger integrity checks live in
`src/features/ledgers/server/ledger-integrity-service.ts`.

The checker validates core accounting and data-integrity invariants, including:

- Duplicate ids for accounts, categories, allocations, and transactions.
- Account balance reconciliation:

  ```text
  current account balance =
    openingBalanceCents + financial posting deltas
  ```

- Transaction line shape and references.
- Posting references to financial, category, and equity ledger accounts.
- Balanced transaction postings.
- Transaction display amount matching reference-account posting movement.
- Transaction line-derived postings matching stored ledger postings.
- Budget allocation ids matching `periodId:categoryId`.
- Budget allocation category and period references.
- Budget period id and date bounds.
- Allocation source reconciliation:

  ```text
  visible category assignments - projected opening-balance funding = 0
  ```

The current allocation-source mismatch finding code is:

```text
budget_allocation_source_mismatch
```

Uncategorized one-sided account activity is valid user workflow state, not
ledger corruption. Transfers without categories are also valid. The checker
still reports invalid references, unbalanced postings, stray equity postings on
categorized transactions, and transaction/posting mismatches.

Future changes should avoid reintroducing persisted starting-balance
transactions or database-level category opening balances. Opening balances are
account state; category month starts are projections.
