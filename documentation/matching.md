# Transaction Auto-Classification Matching

This document covers category auto-classification. Transaction duplicate and
credit-card-payment auto-matching in the Transactions view, and Amazon payment
matching, are separate workflows.

The current classifier uses prompt version `2026-08-07.v1`. Account-level
"Classify Now" and scheduled background runs share the same optimized
workflow.

## Decision order

For each eligible transaction:

1. **Reuse a current result.** If the unchanged transaction already has a
   fresh pending `category` or `noSuggestion` result, do not classify it again.
2. **Try the appropriate local path.** Use semantic matching when the target
   has a memo and qualifying memo-bearing source embeddings. Otherwise, use
   deterministic exact-merchant history.
3. **Accept a strong local result.** Semantic evidence gates or deterministic
   merchant voting may resolve the category without a model call.
4. **Use compact semantic model context when needed.** If semantic evidence
   exists but conflicts or is not strong enough for a local answer, ask the
   LLM using the small category shortlist and selected semantic matches.
5. **Fall back to broad LLM classification.** If neither local path can decide,
   ask the LLM using every active user-visible category, distinct Plaid fields,
   and selected same-merchant history. This includes targets with no memo or no
   qualifying embedding match.
6. **Allow the LLM to decline.** Invalid assignments and explicit model
   uncertainty become `noSuggestion`; the service does not invent or accept an
   invalid category.
7. **Save the result for review.** Cache both category suggestions and
   `noSuggestion` results so unchanged transactions are not processed again.

Transaction templates are not part of auto-classification. They remain
available for explicit manual use in transaction editors.

When a target reaches the model, managed order context includes only the
provider and item summary. Provider record ids, order numbers, and payment kind
remain private bookkeeping details and are not sent to the model. The model is
instructed not to copy managed metadata into suggested payee or memo text. Order
metadata remains excluded from embeddings and the editable memo value.

## Eligibility and source cache

A target must be a non-zero, standard, non-voided, non-transfer transaction
with at least one uncategorized one-sided account-movement line.

Classification history comes from the ledger-scoped
`transactionClassificationSource` cache. A source is included only when the
transaction is standard, non-zero, non-voided, non-transfer, and fully
categorized. Each compact source record stores:

- date, amount, account, payee, memo, memo presence, and final category
  assignments;
- normalized payee and Plaid merchant/name/original-description/category/PFC
  fields; and
- source timestamps used to detect stale records.

The cache is updated with transaction classification changes and deletion. The
embedding rebuild also refreshes stale source records and deletes orphans. It
is derived data and is not workspace-synced or exported.

Account and scheduled background runs load source and embedding records once,
reuse them across 25-target chunks, and do not load full ledger transaction
history.

## Semantic path

Semantic matching runs only when both the target and candidate source have a
non-empty normalized memo. OpenAI `text-embedding-3-small` produces
256-dimensional vectors from normalized:

- payee and memo;
- Plaid merchant name and transaction name;
- Plaid category text; and
- Plaid primary and detailed Personal Finance Categories.

Amount, account, date, assigned category, and raw Plaid JSON are excluded from
embedding text. Existing memo-less and template embeddings are obsolete and
are removed by rebuild.

The classification model is selected per ledger from the currently configured
providers. OpenAI `gpt-5.6-luna` is listed first and is the default for new or
invalid settings when OpenAI is configured. The configured Google model remains
available, and an existing Google selection remains selected. Legacy
`gpt-5-mini` settings resolve to Luna when OpenAI is configured. Luna uses the
Responses API with structured output and medium reasoning effort; Google uses
temperature zero. This is independent of semantic retrieval: embeddings always
use OpenAI `text-embedding-3-small`.

Cosine similarity must be at least `0.55` to enter semantic context. Up to 75
raw matches are inspected, eight reranked candidates are retained per target,
three are sent to the LLM, and one request contains at most 15 distinct prior
transactions.

### Semantic reranking

These points rank embedding-selected candidates; they are not confidence
percentages.

| Signal | Points |
| --- | ---: |
| Exact fingerprint | +160 |
| Embedding similarity >= `0.55` | `35 + similarity * 100` |
| Memo/detail token overlap | +12 per token, maximum +48 |
| Plaid category/PFC overlap | +10 plus +4 per token, maximum +34 |
| Exact amount | +18 |
| Same amount bucket when not exact | +6 |
| Compatible amount sign | +8 |
| Same account | +8 |
| Exact Plaid merchant | +8 |
| Exact payee | +6 |
| Recency | +0 to +10 |

Recency is `max(0, 10 - daysApart / 30)`. Amount buckets are under $10,
$10-25, $25-50, $50-100, $100-250, $250-500, $500-1,000, and over $1,000.

The fingerprint contains normalized amount sign, account name, payee, memo,
Plaid merchant, and Plaid category. It does not contain amount magnitude.

### Local semantic gates

A candidate may produce a local category only through one of these gates:

1. exact fingerprint;
2. embedding similarity at least `0.90` with compatible amount sign;
3. exact amount with at least two memo/detail tokens overlapping; or
4. exact amount with exact Plaid merchant and Plaid category/PFC overlap.

Amount, payee, account, bucket, or recency can improve rank but cannot create a
semantic local match by themselves. A top candidate must have one final
category. Conflicting strong categories defer to the LLM unless an exact
fingerprint resolves the conflict. Multi-candidate voting requires at least
67% support and normally at least two votes.

Local confidence is `0.98` for a direct or unanimous result and `0.90` for a
non-unanimous dominant result.

### LLM use

There are two model contexts:

- **Semantic:** uses the existing compact category shortlist, selected
  memo-bearing matches, matched user feedback, reusable guidance, and custom
  system instructions.
- **Fallback:** uses every active user-visible category after local matching
  cannot decide. It includes transaction text, account, signed amount and line
  direction, distinct Plaid merchant/name/original-description/category/PFC
  fields, and selected same-merchant history.

Plaid values are compared in normalized form before prompt construction so
equivalent merchant, transaction-name, description, category, and PFC values
are not repeated. Original display text is retained for fields that are sent;
raw Plaid JSON is never included.

Fallback merchant identity is an exact normalized match across transaction
payee, Plaid merchant name, and Plaid transaction name. Original description is
context, not identity. Up to eight prior categorized transactions are selected
per target: first the newest example for each distinct category combination,
then the newest remaining examples. Each example includes date, amount, payee,
memo, distinct Plaid fields, and every assigned category. Shared examples are
deduplicated within a batch.

Both contexts may return only `category` or `noSuggestion`. Every uncategorized
line must be assigned to a category allowed by its context; otherwise the
result is normalized to `noSuggestion`.

Feedback is included only when the user explicitly typed it and its original
transaction is one of the embedding-selected matches. Payee and memo
suggestions remain review-only. The exact request and response are retained in
the 12-hour interaction debug log.

## Deterministic path

Deterministic matching runs when the target has no memo or semantic matching
has no qualifying memo-to-memo context. The local decision does not use
embeddings, memo text, account, guidance, feedback, or templates. It supports
one unclassified target line and source transactions with one final category.
If this local decision cannot classify the target, the shared LLM fallback runs.

A source qualifies only when target and source have an exact normalized
identity cross-match among:

- transaction payee;
- Plaid merchant name; or
- Plaid transaction name.

Plaid category, primary PFC, and detailed PFC compatibility prefer identity
matches when compatible records exist. Plaid category overlap alone never
qualifies an unrelated merchant.

The category is resolved in this exact order:

1. Sort qualifying records by transaction date descending and keep the 10 most
   recent.
2. If any retained record has the exact amount, discard non-exact amounts from
   the voting set.
3. Choose the most common category in the remaining set.
4. If counts tie, choose the category used by the most recent transaction.

Confidence is `0.98` when the voting set is unanimous and `0.90` when majority
or recency resolves disagreement. This path does not suggest payee or memo.

## Pending results and diagnostics

Pending results expire after 90 days and are ignored sooner when their prompt
version or transaction timestamp is stale. `noSuggestion` is cached to prevent
repeated processing of unchanged transactions. Applying or dismissing deletes
the pending record. Only typed feedback is persisted; typed rejection feedback
is also added to the ledger's reusable classification guidance.

Debug output identifies the path as local semantic, deterministic, semantic
LLM, LLM fallback, or no suggestion. Semantic details show embedding similarity
and gate evidence. Deterministic details show matched identities, the recent-10
cutoff, exact-amount filtering, category vote totals, and the recency tie-break
rule. Fallback details show the available category count and selected
same-merchant history evidence.

After deploying source index version 2, run the existing embedding rebuild for
each active ledger. The rebuild refreshes the derived classification source
records with original-description fields; original description remains outside
the embedding text itself.
