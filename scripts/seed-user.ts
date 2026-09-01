import { hashPassword } from "../src/lib/auth/password";
import {
    upsertSeededUserAccount,
    type UserAccountRole,
} from "../src/lib/auth/user-account";

type ParsedArgs = {
    displayName?: string;
    email?: string;
    password?: string;
    role: UserAccountRole;
};

const USAGE = [
    "Usage:",
    "  pnpm seed:user -- --email <email> --password <password> [--role super|normal] [--display-name <name>]",
    "",
    "Options:",
    "  --email <email>          User email address.",
    "  --password <password>    Initial password.",
    "  --role <role>            Account role. Defaults to super.",
    "  --display-name <name>    Optional display name.",
].join("\n");

function parseArgs(args: string[]): ParsedArgs {
    const parsed: ParsedArgs = { role: "super" };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--help" || arg === "-h") {
            throw new Error(USAGE);
        }

        if (arg === "--email") {
            parsed.email = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--password") {
            parsed.password = args[index + 1];
            index += 1;
            continue;
        }

        if (arg === "--role") {
            const role = args[index + 1];

            if (role !== "super" && role !== "normal") {
                throw new Error(`Invalid --role value.\n\n${USAGE}`);
            }

            parsed.role = role;
            index += 1;
            continue;
        }

        if (arg === "--display-name") {
            parsed.displayName = args[index + 1];
            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }

    if (!parsed.email || !parsed.password) {
        throw new Error(`Missing required --email or --password.\n\n${USAGE}`);
    }

    return parsed;
}

async function main() {
    const input = parseArgs(process.argv.slice(2));
    const passwordHash = await hashPassword(input.password!);
    const user = await upsertSeededUserAccount({
        displayName: input.displayName,
        email: input.email!,
        passwordHash,
        role: input.role,
    });

    console.log(`Seeded ${user.role} user ${user.email} (${user.userId})`);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
