import { Entity } from "electrodb";

import {
    TRANSACTION_IMPORT_DIRECTIONS,
    TRANSACTION_IMPORTER_IDS,
    TRANSACTION_IMPORT_STATES,
} from "@/features/transaction-importers/models/transaction-importer-contract";
import type { EntityOptions } from "@/lib/db/entity-options";

export function createTransactionImportActivityEntity(options: EntityOptions) {
    return new Entity(
        {
            model: {
                entity: "transactionImportActivity",
                version: "1",
                service: "budgeted",
            },
            attributes: {
                activityId: { type: "string", required: true },
                candidateTransactionIdsJson: { type: "string" },
                counterparty: { type: "string" },
                createdAt: { type: "string", required: true },
                detailsJson: { type: "string", required: true },
                detailsVersion: { type: "number", required: true },
                direction: {
                    type: TRANSACTION_IMPORT_DIRECTIONS,
                    required: true,
                },
                externalAccountKey: { type: "string" },
                financialFingerprint: { type: "string", required: true },
                ledgerId: { type: "string", required: true },
                linkedTransactionId: { type: "string" },
                memo: { type: "string" },
                occurredDate: { type: "string", required: true },
                processingError: { type: "string" },
                provider: {
                    type: TRANSACTION_IMPORTER_IDS,
                    required: true,
                },
                providerAmountCents: { type: "number", required: true },
                providerRecordId: { type: "string", required: true },
                state: {
                    type: TRANSACTION_IMPORT_STATES,
                    required: true,
                },
                updatedAt: { type: "string", required: true },
            },
            indexes: {
                byActivity: {
                    pk: { field: "pk", composite: ["ledgerId"] },
                    sk: { field: "sk", composite: ["activityId"] },
                },
                byProviderRecord: {
                    index: "gsi2",
                    pk: { field: "gsi2pk", composite: ["ledgerId", "provider"] },
                    sk: { field: "gsi2sk", composite: ["providerRecordId"] },
                },
            },
        },
        options,
    );
}
