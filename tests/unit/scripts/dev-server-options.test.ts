import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

let devServerOptions: {
    buildNextDevArgs: (commandArgs: string[], options: unknown) => string[];
    createDevServerEnv: (
        env: Record<string, string>,
        options: {
            hostname?: string;
            https?: boolean;
            httpsCa?: string;
            httpsCert?: string;
            httpsKey?: string;
            port?: string;
        },
    ) => Record<string, string>;
    createSstDevEnv: (
        env: Record<string, string>,
        isInteractiveTerminal: boolean,
    ) => Record<string, string>;
    formatDevServerUrl: (options: {
        hostname?: string;
        https?: boolean;
        port?: string;
    }) => string;
    loadLocalDevServerEnv: (
        env?: Record<string, string | undefined>,
        cwd?: string,
    ) => Record<string, string | undefined>;
    parseDevServerArgs: (
        args: string[],
        env?: Record<string, string | undefined>,
    ) => {
        hostname?: string;
        https: boolean;
        httpsCa?: string;
        httpsCert?: string;
        httpsKey?: string;
        port?: string;
        remainingArgs: string[];
    };
    prepareDevServerOptions: (
        options: {
            hostname?: string;
            https: boolean;
            httpsCa?: string;
            httpsCert?: string;
            httpsKey?: string;
            port?: string;
            remainingArgs: string[];
        },
        settings?: {
            cwd?: string;
            mkcertBinaryPath?: string;
            opensslBinaryPath?: string;
        },
    ) => {
        hostname?: string;
        https: boolean;
        httpsCa?: string;
        httpsCert?: string;
        httpsKey?: string;
        port?: string;
        remainingArgs: string[];
    };
};

const itWithOpenSsl = hasOpenSsl() ? it : it.skip;

beforeAll(async () => {
    devServerOptions = await import(
        pathToFileURL(path.resolve("scripts/dev-server-options.mjs")).href
    );
});

describe("dev server option parsing", () => {
    it("extracts local server flags without dropping SST flags", () => {
        const options = devServerOptions.parseDevServerArgs(
            [
                "--stage",
                "local",
                "--hostname",
                "127.0.0.1",
                "--port",
                "3005",
                "--print-logs",
            ],
            {},
        );

        expect(options).toEqual({
            hostname: "127.0.0.1",
            https: false,
            httpsCa: undefined,
            httpsCert: undefined,
            httpsKey: undefined,
            port: "3005",
            remainingArgs: ["--stage", "local", "--print-logs"],
        });
    });

    it("builds normalized Next dev arguments", () => {
        const options = devServerOptions.parseDevServerArgs(
            ["--host=budgeted.local", "-p", "3007", "--experimental-https"],
            {},
        );

        expect(devServerOptions.buildNextDevArgs(["next", "dev"], options)).toEqual(
            [
                "next",
                "dev",
                "--hostname",
                "budgeted.local",
                "--port",
                "3007",
                "--experimental-https",
            ],
        );
        expect(devServerOptions.formatDevServerUrl(options)).toBe(
            "https://budgeted.local:3007",
        );
    });

    it("builds custom HTTPS certificate arguments", () => {
        const options = devServerOptions.parseDevServerArgs(
            [
                "--experimental-https-key",
                "./certs/localhost-key.pem",
                "--experimental-https-cert=./certs/localhost.pem",
                "--experimental-https-ca",
                "./certs/root-ca.pem",
            ],
            {},
        );

        expect(options).toMatchObject({
            https: true,
            httpsCa: "./certs/root-ca.pem",
            httpsCert: "./certs/localhost.pem",
            httpsKey: "./certs/localhost-key.pem",
        });
        expect(devServerOptions.buildNextDevArgs(["next", "dev"], options)).toEqual(
            [
                "next",
                "dev",
                "--experimental-https",
                "--experimental-https-key",
                "./certs/localhost-key.pem",
                "--experimental-https-cert",
                "./certs/localhost.pem",
                "--experimental-https-ca",
                "./certs/root-ca.pem",
            ],
        );
    });

    it("rejects incomplete custom HTTPS certificate settings", () => {
        const keyOnly = devServerOptions.parseDevServerArgs([], {
            BUDGETED_DEV_HTTPS_KEY: "./certs/localhost-key.pem",
        });
        const certOnly = devServerOptions.parseDevServerArgs([], {
            BUDGETED_DEV_HTTPS_CERT: "./certs/localhost.pem",
        });

        expect(() => devServerOptions.prepareDevServerOptions(keyOnly)).toThrow(
            "BUDGETED_DEV_HTTPS_KEY and BUDGETED_DEV_HTTPS_CERT must be provided together.",
        );
        expect(() => devServerOptions.prepareDevServerOptions(certOnly)).toThrow(
            "BUDGETED_DEV_HTTPS_KEY and BUDGETED_DEV_HTTPS_CERT must be provided together.",
        );
    });

    it("uses explicit dev server environment values", () => {
        const options = devServerOptions.parseDevServerArgs([], {
            BUDGETED_DEV_HOSTNAME: "127.0.0.1",
            BUDGETED_DEV_PORT: "3010",
            PORT: "3000",
        });

        expect(options.hostname).toBe("127.0.0.1");
        expect(options.port).toBe("3010");
        expect(devServerOptions.createDevServerEnv({ NODE_ENV: "test" }, options))
            .toMatchObject({
                BUDGETED_DEV_HOSTNAME: "127.0.0.1",
                BUDGETED_DEV_HTTPS: "0",
                BUDGETED_DEV_PORT: "3010",
                NODE_ENV: "test",
                PORT: "3010",
            });
    });

    it("uses an interactive terminal type for the SST multiplexer", () => {
        expect(
            devServerOptions.createSstDevEnv({ TERM: "dumb" }, true),
        ).toEqual({ TERM: "xterm-256color" });
        expect(devServerOptions.createSstDevEnv({}, true)).toEqual({
            TERM: "xterm-256color",
        });
        expect(
            devServerOptions.createSstDevEnv({ TERM: "screen-256color" }, true),
        ).toEqual({ TERM: "screen-256color" });
        expect(
            devServerOptions.createSstDevEnv({ TERM: "dumb" }, false),
        ).toEqual({ TERM: "dumb" });
    });

    it("parses .env.local HTTPS without requiring certificate paths", () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "budgeted-dev-env-"));

        try {
            fs.writeFileSync(
                path.join(cwd, ".env.local"),
                [
                    "BUDGETED_DEV_HOSTNAME=127.0.0.1",
                    "BUDGETED_DEV_HTTPS=true",
                    "BUDGETED_DEV_PORT=3020",
                ].join("\n"),
            );

            const env = devServerOptions.loadLocalDevServerEnv({}, cwd);
            const options = devServerOptions.parseDevServerArgs([], env);

            expect(options.hostname).toBe("127.0.0.1");
            expect(options.https).toBe(true);
            expect(options.httpsCert).toBeUndefined();
            expect(options.httpsKey).toBeUndefined();
            expect(options.port).toBe("3020");
            expect(devServerOptions.buildNextDevArgs(["next", "dev"], options))
                .toEqual([
                    "next",
                    "dev",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    "3020",
                    "--experimental-https",
                ]);
        } finally {
            fs.rmSync(cwd, { force: true, recursive: true });
        }
    });

    itWithOpenSsl("prepares a generated HTTPS certificate with a common name", () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "budgeted-dev-env-"));

        try {
            const caDir = path.join(cwd, "ca");
            const rootCA = path.join(caDir, "rootCA.pem");
            const rootCAKey = path.join(caDir, "rootCA-key.pem");
            const mkcert = path.join(cwd, "mkcert");

            fs.mkdirSync(caDir, { recursive: true });
            execFileSync("openssl", ["genrsa", "-out", rootCAKey, "2048"], {
                stdio: "ignore",
            });
            execFileSync(
                "openssl",
                [
                    "req",
                    "-x509",
                    "-new",
                    "-nodes",
                    "-key",
                    rootCAKey,
                    "-sha256",
                    "-days",
                    "1",
                    "-subj",
                    "/CN=Budgeted Test Root",
                    "-out",
                    rootCA,
                ],
                { stdio: "ignore" },
            );
            fs.writeFileSync(
                mkcert,
                [
                    "#!/usr/bin/env node",
                    "if (process.argv[2] === '-CAROOT') {",
                    `  console.log(${JSON.stringify(caDir)});`,
                    "  process.exit(0);",
                    "}",
                    "process.exit(42);",
                    "",
                ].join("\n"),
            );
            fs.chmodSync(mkcert, 0o755);

            const options = devServerOptions.parseDevServerArgs(
                ["--hostname", "budgeted.ldev"],
                { BUDGETED_DEV_HTTPS: "1" },
            );
            const prepared = devServerOptions.prepareDevServerOptions(
                options,
                {
                    cwd,
                    mkcertBinaryPath: mkcert,
                    opensslBinaryPath: "openssl",
                },
            );

            expect(prepared.httpsCert).toBe(path.join(
                cwd,
                "certificates",
                "localhost.pem",
            ));
            expect(prepared.httpsKey).toBe(path.join(
                cwd,
                "certificates",
                "localhost-key.pem",
            ));
            const certificate = execFileSync(
                "openssl",
                [
                    "x509",
                    "-in",
                    prepared.httpsCert!,
                    "-noout",
                    "-subject",
                    "-ext",
                    "subjectAltName",
                ],
                { encoding: "utf8" },
            );

            expect(certificate).toContain("CN=budgeted.ldev");
            expect(certificate).toContain("DNS:budgeted.ldev");
            expect(certificate).toContain("DNS:localhost");
            expect(certificate).toContain("IP Address:127.0.0.1");
        } finally {
            fs.rmSync(cwd, { force: true, recursive: true });
        }
    });

    it("leaves bare HTTPS generation to Next when the cached mkcert binary is unavailable", () => {
        const options = devServerOptions.parseDevServerArgs([], {
            BUDGETED_DEV_HTTPS: "1",
        });

        const prepared = devServerOptions.prepareDevServerOptions(options, {
            mkcertBinaryPath: "/tmp/missing-budgeted-mkcert",
        });

        expect(prepared).toEqual(options);
        expect(devServerOptions.buildNextDevArgs(["next", "dev"], prepared))
            .toEqual(["next", "dev", "--experimental-https"]);
    });

    it("keeps command-line host and port ahead of .env.local values", () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "budgeted-dev-env-"));

        try {
            fs.writeFileSync(
                path.join(cwd, ".env.local"),
                [
                    "BUDGETED_DEV_HOSTNAME=127.0.0.1",
                    "BUDGETED_DEV_HTTPS=true",
                    "BUDGETED_DEV_PORT=3020",
                ].join("\n"),
            );

            const env = devServerOptions.loadLocalDevServerEnv({}, cwd);
            const options = devServerOptions.parseDevServerArgs(
                [
                    "--hostname",
                    "budgeted.local",
                    "--port",
                    "4040",
                    "--no-experimental-https",
                ],
                env,
            );

            expect(options.hostname).toBe("budgeted.local");
            expect(options.https).toBe(false);
            expect(options.port).toBe("4040");
        } finally {
            fs.rmSync(cwd, { force: true, recursive: true });
        }
    });

    it("formats wildcard hosts as localhost URLs", () => {
        const options = devServerOptions.parseDevServerArgs(
            ["--hostname", "0.0.0.0"],
            {},
        );

        expect(devServerOptions.formatDevServerUrl(options)).toBe(
            "http://localhost:3000",
        );
    });

    itWithOpenSsl("reuses a valid local certificate when mkcert is unavailable", () => {
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "budgeted-dev-env-"));

        try {
            const caDir = path.join(cwd, "ca");
            const rootCA = path.join(caDir, "rootCA.pem");
            const rootCAKey = path.join(caDir, "rootCA-key.pem");
            const mkcert = path.join(cwd, "mkcert");

            fs.mkdirSync(caDir, { recursive: true });
            execFileSync("openssl", ["genrsa", "-out", rootCAKey, "2048"], {
                stdio: "ignore",
            });
            execFileSync(
                "openssl",
                [
                    "req",
                    "-x509",
                    "-new",
                    "-nodes",
                    "-key",
                    rootCAKey,
                    "-sha256",
                    "-days",
                    "1",
                    "-subj",
                    "/CN=Budgeted Test Root",
                    "-out",
                    rootCA,
                ],
                { stdio: "ignore" },
            );
            fs.writeFileSync(
                mkcert,
                [
                    "#!/usr/bin/env node",
                    "if (process.argv[2] === '-CAROOT') {",
                    `  console.log(${JSON.stringify(caDir)});`,
                    "  process.exit(0);",
                    "}",
                    "process.exit(42);",
                    "",
                ].join("\n"),
            );
            fs.chmodSync(mkcert, 0o755);

            const options = devServerOptions.parseDevServerArgs([], {
                BUDGETED_DEV_HOSTNAME: "budgeted.ldev",
                BUDGETED_DEV_HTTPS: "1",
            });
            devServerOptions.prepareDevServerOptions(options, {
                cwd,
                mkcertBinaryPath: mkcert,
                opensslBinaryPath: "openssl",
            });

            const prepared = devServerOptions.prepareDevServerOptions(options, {
                cwd,
                mkcertBinaryPath: path.join(cwd, "missing-mkcert"),
            });

            expect(prepared).toMatchObject({
                https: true,
                httpsCa: undefined,
                httpsCert: path.join(
                    cwd,
                    "certificates",
                    "localhost.pem",
                ),
                httpsKey: path.join(
                    cwd,
                    "certificates",
                    "localhost-key.pem",
                ),
            });
        } finally {
            fs.rmSync(cwd, { force: true, recursive: true });
        }
    });

    it("formats HTTPS wildcard hosts as localhost URLs", () => {
        const options = devServerOptions.parseDevServerArgs(
            ["--hostname", "0.0.0.0", "--experimental-https"],
            {},
        );

        expect(devServerOptions.formatDevServerUrl(options)).toBe(
            "https://localhost:3000",
        );
    });

    it("rejects invalid ports", () => {
        expect(() =>
            devServerOptions.parseDevServerArgs(["--port", "70000"], {}),
        ).toThrow("Dev server port must be between 1 and 65535.");
    });
});

function hasOpenSsl() {
    try {
        execFileSync("openssl", ["version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}
