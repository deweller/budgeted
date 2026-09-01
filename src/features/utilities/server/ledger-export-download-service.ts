import { gzipSync } from "node:zlib";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ulid } from "ulid";

import {
    LEDGER_EXPORT_ARTIFACT_PREFIX,
    LEDGER_EXPORT_DOWNLOAD_URL_EXPIRES_IN_SECONDS,
} from "@/features/utilities/models/ledger-export-artifact";
import {
    buildLedgerExportFile,
    createLedgerExportFilename,
} from "@/features/utilities/server/ledger-transfer-service";
import { requireLinkedBucketName } from "@/lib/db/resource";

type CurrentWorkspaceUser = {
    activeLedgerId: string;
    activeLedgerName: string;
    userId: string;
};

const s3 = new S3Client({});

function createArtifactKey() {
    return `${LEDGER_EXPORT_ARTIFACT_PREFIX}${ulid()}.json.gz`;
}

export async function createLedgerExportDownload(
    user: CurrentWorkspaceUser,
    options: { timeZone?: string } = {},
) {
    const exportFile = await buildLedgerExportFile(user);
    const bucketName = requireLinkedBucketName("LedgerExportArtifacts");
    const key = createArtifactKey();
    const filename = createLedgerExportFilename(exportFile, options.timeZone);
    const body = gzipSync(JSON.stringify(exportFile, null, 2));

    await s3.send(
        new PutObjectCommand({
            Body: body,
            Bucket: bucketName,
            CacheControl: "private, no-store",
            ContentDisposition: `attachment; filename="${filename}"`,
            ContentType: "application/gzip",
            Key: key,
            ServerSideEncryption: "AES256",
        }),
    );

    return {
        downloadUrl: await getSignedUrl(
            s3,
            new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
            }),
            { expiresIn: LEDGER_EXPORT_DOWNLOAD_URL_EXPIRES_IN_SECONDS },
        ),
    };
}
