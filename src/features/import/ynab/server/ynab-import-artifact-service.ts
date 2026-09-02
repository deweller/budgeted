import {
    DeleteObjectsCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { strFromU8, unzipSync } from "fflate";

import { createYnabCsvExport } from "@/features/import/ynab/csv";
import type { CreateYnabImportUploadInput } from "@/features/import/ynab/models/ynab-import-job";
import { requireLinkedBucketName } from "@/lib/db/resource";

const ARTIFACT_PREFIX = "ynab-imports/";
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const UPLOAD_URL_EXPIRES_SECONDS = 15 * 60;

function createYnabImportS3Client(config: S3ClientConfig = {}) {
    return new S3Client({
        ...config,
        requestChecksumCalculation: "WHEN_REQUIRED",
    });
}

const s3 = createYnabImportS3Client();

export type YnabImportSourceFile = {
    contentType: string;
    key: string;
    kind: "plan" | "register" | "zip";
    name: string;
    size: number;
};

function artifactKey(jobId: string, kind: YnabImportSourceFile["kind"]) {
    return `${ARTIFACT_PREFIX}${jobId}/source-${kind}`;
}

export async function createYnabImportUploadTargets(
    jobId: string,
    input: CreateYnabImportUploadInput,
) {
    const bucketName = requireLinkedBucketName("YnabImportArtifacts");
    const files: YnabImportSourceFile[] = input.files.map((file) => ({
        ...file,
        key: artifactKey(jobId, file.kind),
    }));
    const uploads = await Promise.all(
        files.map(async (file) => ({
            kind: file.kind,
            url: await getSignedUrl(
                s3,
                new PutObjectCommand({
                    Bucket: bucketName,
                    ContentType: file.contentType,
                    Key: file.key,
                }),
                { expiresIn: UPLOAD_URL_EXPIRES_SECONDS },
            ),
        })),
    );

    return { files, uploads };
}

async function readSourceFile(file: YnabImportSourceFile) {
    const bucketName = requireLinkedBucketName("YnabImportArtifacts");
    const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: file.key }),
    );
    const size = head.ContentLength ?? 0;

    if (size <= 0 || size > MAX_SOURCE_BYTES || size !== file.size) {
        throw new Error(`Uploaded YNAB file "${file.name}" has an invalid size.`);
    }

    const result = await s3.send(
        new GetObjectCommand({ Bucket: bucketName, Key: file.key }),
    );

    if (!result.Body) {
        throw new Error(`Uploaded YNAB file "${file.name}" is missing.`);
    }

    return result.Body.transformToByteArray();
}

function baseName(path: string) {
    return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function exportNameFromPlanName(name: string) {
    return baseName(name).replace(/\s*-\s*Plan\.csv$/iu, "").trim();
}

function findSingleZipEntry(
    entries: Record<string, Uint8Array>,
    suffix: "Plan.csv" | "Register.csv",
) {
    const matches = Object.entries(entries).filter(([name]) =>
        baseName(name).toLowerCase().endsWith(suffix.toLowerCase()),
    );

    if (matches.length !== 1) {
        throw new Error(`The YNAB ZIP must contain exactly one *${suffix} file.`);
    }

    return matches[0]!;
}

export function createYnabCsvExportFromZip(bytes: Uint8Array) {
    const entries = unzipSync(bytes);
    const totalBytes = Object.values(entries).reduce(
        (total, entry) => total + entry.byteLength,
        0,
    );

    if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error("The uncompressed YNAB export is too large.");
    }

    const [planName, planBytes] = findSingleZipEntry(entries, "Plan.csv");
    const [, registerBytes] = findSingleZipEntry(entries, "Register.csv");

    return createYnabCsvExport({
        exportName: exportNameFromPlanName(planName),
        planContent: strFromU8(planBytes),
        registerContent: strFromU8(registerBytes),
    });
}

export async function readYnabImportSource(files: YnabImportSourceFile[]) {
    const zipFile = files.find((file) => file.kind === "zip");

    if (zipFile) {
        return createYnabCsvExportFromZip(await readSourceFile(zipFile));
    }

    const planFile = files.find((file) => file.kind === "plan");
    const registerFile = files.find((file) => file.kind === "register");

    if (!planFile || !registerFile) {
        throw new Error("Choose one YNAB Plan CSV and one Register CSV.");
    }

    const [planBytes, registerBytes] = await Promise.all([
        readSourceFile(planFile),
        readSourceFile(registerFile),
    ]);

    return createYnabCsvExport({
        exportName: exportNameFromPlanName(planFile.name),
        planContent: new TextDecoder().decode(planBytes),
        registerContent: new TextDecoder().decode(registerBytes),
    });
}

export async function deleteYnabImportArtifacts(files: YnabImportSourceFile[]) {
    if (files.length === 0) {
        return;
    }

    await s3.send(
        new DeleteObjectsCommand({
            Bucket: requireLinkedBucketName("YnabImportArtifacts"),
            Delete: { Objects: files.map((file) => ({ Key: file.key })) },
        }),
    );
}

export const ynabImportArtifactTestInternals = {
    createYnabImportS3Client,
};
