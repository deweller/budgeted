const DEFAULT_CHUNK_SIZE = 25;

export function chunkRecords<TRecord>(
    records: TRecord[],
    chunkSize = DEFAULT_CHUNK_SIZE,
) {
    const chunks: TRecord[][] = [];

    for (let index = 0; index < records.length; index += chunkSize) {
        chunks.push(records.slice(index, index + chunkSize));
    }

    return chunks;
}

export async function writeChunkedRecords<TRecord>(
    records: TRecord[],
    writeRecord: (record: TRecord) => Promise<unknown>,
    chunkSize = DEFAULT_CHUNK_SIZE,
) {
    for (const recordChunk of chunkRecords(records, chunkSize)) {
        await Promise.all(recordChunk.map(writeRecord));
    }
}
