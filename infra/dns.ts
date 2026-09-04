export type ExternalDnsRecord = {
    name: string;
    priority?: number;
    type: string;
    value: string;
};

export function formatExternalDnsRecords(records: ExternalDnsRecord[]) {
    const formattedRecords = records
        .map((record) =>
            [
                `  ${record.type} record`,
                `    Name: ${record.name}`,
                ...(record.priority === undefined
                    ? []
                    : [`    Priority: ${record.priority}`]),
                `    Value: ${record.value}`,
            ].join("\n"),
        )
        .join("\n\n");

    return `\n${formattedRecords}`;
}
