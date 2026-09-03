import { execFileSync } from "node:child_process";
import { createPrivateKey, X509Certificate } from "node:crypto";
import fs from "node:fs";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";

const devHostnameEnvName = "BUDGETED_DEV_HOSTNAME";
const devPortEnvName = "BUDGETED_DEV_PORT";
const devHttpsEnvName = "BUDGETED_DEV_HTTPS";
const devHttpsKeyEnvName = "BUDGETED_DEV_HTTPS_KEY";
const devHttpsCertEnvName = "BUDGETED_DEV_HTTPS_CERT";
const devHttpsCaEnvName = "BUDGETED_DEV_HTTPS_CA";
const defaultDevPort = "3000";
const defaultUrlHostname = "localhost";
const defaultHttpsCertificatePathSegments = [".local", "certificates"];
const localEnvFileName = ".env.local";
const mkcertVersion = "v1.4.4";
const opensslBinaryName = "openssl";

export function stripPackageManagerSeparator(args) {
    return args[0] === "--" ? args.slice(1) : args;
}

export function loadLocalDevServerEnv(env = process.env, cwd = process.cwd()) {
    const localEnv = parseLocalEnvFile(path.join(cwd, localEnvFileName));
    const mergedEnv = { ...env };

    mergeDevServerEnvValue(mergedEnv, localEnv, devHostnameEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, devPortEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, devHttpsEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, devHttpsKeyEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, devHttpsCertEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, devHttpsCaEnvName);
    mergeDevServerEnvValue(mergedEnv, localEnv, "PORT");

    return mergedEnv;
}

export function parseDevServerArgs(args, env = process.env) {
    const remainingArgs = [];
    let hostname = readOptionalEnvValue(env[devHostnameEnvName]);
    let port =
        readOptionalEnvValue(env[devPortEnvName]) ??
        readOptionalEnvValue(env.PORT);
    let https = readOptionalBooleanEnv(env[devHttpsEnvName], devHttpsEnvName);
    let httpsKey = readOptionalEnvValue(env[devHttpsKeyEnvName]);
    let httpsCert = readOptionalEnvValue(env[devHttpsCertEnvName]);
    let httpsCa = readOptionalEnvValue(env[devHttpsCaEnvName]);

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--hostname" || arg === "--host" || arg === "-H") {
            hostname = readRequiredArgValue(args, index, arg);
            index += 1;
            continue;
        }

        if (arg.startsWith("--hostname=") || arg.startsWith("--host=")) {
            hostname = readInlineArgValue(arg);
            continue;
        }

        if (arg === "--port" || arg === "-p") {
            port = readRequiredArgValue(args, index, arg);
            index += 1;
            continue;
        }

        if (arg.startsWith("--port=")) {
            port = readInlineArgValue(arg);
            continue;
        }

        if (arg === "--experimental-https") {
            https = true;
            continue;
        }

        if (arg === "--no-experimental-https") {
            https = false;
            httpsKey = undefined;
            httpsCert = undefined;
            httpsCa = undefined;
            continue;
        }

        if (arg === "--experimental-https-key") {
            https = true;
            httpsKey = readRequiredArgValue(args, index, arg);
            index += 1;
            continue;
        }

        if (arg.startsWith("--experimental-https-key=")) {
            https = true;
            httpsKey = readInlineArgValue(arg);
            continue;
        }

        if (arg === "--experimental-https-cert") {
            https = true;
            httpsCert = readRequiredArgValue(args, index, arg);
            index += 1;
            continue;
        }

        if (arg.startsWith("--experimental-https-cert=")) {
            https = true;
            httpsCert = readInlineArgValue(arg);
            continue;
        }

        if (arg === "--experimental-https-ca") {
            https = true;
            httpsCa = readRequiredArgValue(args, index, arg);
            index += 1;
            continue;
        }

        if (arg.startsWith("--experimental-https-ca=")) {
            https = true;
            httpsCa = readInlineArgValue(arg);
            continue;
        }

        remainingArgs.push(arg);
    }

    const normalizedHttps = normalizeHttps(https, {
        httpsCa,
        httpsCert,
        httpsKey,
    });

    return {
        hostname: normalizeHostname(hostname),
        https: normalizedHttps.enabled,
        httpsCa: normalizedHttps.enabled
            ? normalizeFilePath(httpsCa, devHttpsCaEnvName)
            : undefined,
        httpsCert: normalizedHttps.enabled
            ? normalizeFilePath(httpsCert, devHttpsCertEnvName)
            : undefined,
        httpsKey: normalizedHttps.enabled
            ? normalizeFilePath(httpsKey, devHttpsKeyEnvName)
            : undefined,
        port: normalizePort(port),
        remainingArgs,
    };
}

export function createDevServerEnv(env, options) {
    const nextEnv = { ...env };

    if (options.hostname) {
        nextEnv[devHostnameEnvName] = options.hostname;
    }

    if (options.port) {
        nextEnv[devPortEnvName] = options.port;
        nextEnv.PORT = options.port;
    }

    nextEnv[devHttpsEnvName] = options.https ? "1" : "0";
    setOptionalEnvValue(nextEnv, devHttpsKeyEnvName, options.httpsKey);
    setOptionalEnvValue(nextEnv, devHttpsCertEnvName, options.httpsCert);
    setOptionalEnvValue(nextEnv, devHttpsCaEnvName, options.httpsCa);

    return nextEnv;
}

export function prepareDevServerOptions(options, settings = {}) {
    if (
        !options.https ||
        options.httpsKey ||
        options.httpsCert
    ) {
        return options;
    }

    const mkcertBinaryPath =
        settings.mkcertBinaryPath ?? getCachedMkcertBinaryPath();

    if (!mkcertBinaryPath || !fs.existsSync(mkcertBinaryPath)) {
        return options;
    }

    const cwd = settings.cwd ?? process.cwd();
    const certificatePaths = getDefaultHttpsCertificatePaths(cwd);
    const host = getCertificateValidationHost(options.hostname);

    if (!isUsableCertificate(certificatePaths, host)) {
        generateDefaultHttpsCertificate({
            certificatePaths,
            mkcertExecFile: settings.execFileSync ?? execFileSync,
            hostname: options.hostname,
            mkcertBinaryPath,
            opensslBinaryPath: settings.opensslBinaryPath ?? opensslBinaryName,
            opensslExecFile: settings.opensslExecFileSync ?? execFileSync,
        });
    }

    if (!isUsableCertificate(certificatePaths, host)) {
        return options;
    }

    return {
        ...options,
        httpsCa: getMkcertRootCA({
            execFile: settings.execFileSync ?? execFileSync,
            mkcertBinaryPath,
        }),
        httpsCert: certificatePaths.cert,
        httpsKey: certificatePaths.key,
    };
}

export function buildNextDevArgs(commandArgs, options) {
    return [
        ...commandArgs,
        ...(options.hostname ? ["--hostname", options.hostname] : []),
        ...(options.port ? ["--port", options.port] : []),
        ...(options.https ? ["--experimental-https"] : []),
        ...(options.https && options.httpsKey
            ? ["--experimental-https-key", options.httpsKey]
            : []),
        ...(options.https && options.httpsCert
            ? ["--experimental-https-cert", options.httpsCert]
            : []),
        ...(options.https && options.httpsCa
            ? ["--experimental-https-ca", options.httpsCa]
            : []),
        ...options.remainingArgs,
    ];
}

export function formatDevServerUrl(options) {
    const hostname = normalizeUrlHostname(options.hostname);
    const port = options.port ?? defaultDevPort;
    const protocol = options.https ? "https" : "http";

    return `${protocol}://${formatHostnameForUrl(hostname)}:${port}`;
}

export function getDefaultDevPort(options) {
    return options.port ?? defaultDevPort;
}

export function getDefaultDevUrlHostname(options) {
    return normalizeUrlHostname(options.hostname);
}

function readOptionalEnvValue(value) {
    return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalBooleanEnv(value, key) {
    const normalized = readOptionalEnvValue(value)?.trim().toLowerCase();

    if (!normalized) {
        return undefined;
    }

    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    throw new Error(
        `${key} must be true/false, 1/0, yes/no, or on/off.`,
    );
}

function mergeDevServerEnvValue(targetEnv, localEnv, key) {
    const value =
        readOptionalEnvValue(targetEnv[key]) ?? readOptionalEnvValue(localEnv[key]);

    if (value) {
        targetEnv[key] = value;
    }
}

function setOptionalEnvValue(targetEnv, key, value) {
    if (value) {
        targetEnv[key] = value;
        return;
    }

    delete targetEnv[key];
}

function getCachedMkcertBinaryPath() {
    const binaryName = getMkcertBinaryName();

    if (!binaryName) {
        return undefined;
    }

    return path.join(getMkcertCacheDirectory(), binaryName);
}

function getMkcertBinaryName() {
    const arch = process.arch === "x64" ? "amd64" : process.arch;

    if (process.platform === "win32") {
        return `mkcert-${mkcertVersion}-windows-${arch}.exe`;
    }

    if (process.platform === "darwin") {
        return `mkcert-${mkcertVersion}-darwin-${arch}`;
    }

    if (process.platform === "linux") {
        return `mkcert-${mkcertVersion}-linux-${arch}`;
    }

    return undefined;
}

function getMkcertCacheDirectory() {
    if (process.platform === "linux") {
        return path.join(
            process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
            "mkcert",
        );
    }

    if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Caches", "mkcert");
    }

    if (process.platform === "win32") {
        return path.join(
            process.env.LOCALAPPDATA ||
                path.join(os.homedir(), "AppData", "Local"),
            "mkcert",
        );
    }

    return path.join(os.tmpdir(), "mkcert");
}

function getDefaultHttpsCertificatePaths(cwd) {
    const certificateDir = path.join(
        cwd,
        ...defaultHttpsCertificatePathSegments,
    );

    return {
        cert: path.join(certificateDir, "localhost.pem"),
        dir: certificateDir,
        key: path.join(certificateDir, "localhost-key.pem"),
    };
}

function isUsableCertificate(certificatePaths, host) {
    if (
        !fs.existsSync(certificatePaths.cert) ||
        !fs.existsSync(certificatePaths.key)
    ) {
        return false;
    }

    try {
        const cert = new X509Certificate(
            fs.readFileSync(certificatePaths.cert),
        );
        const key = fs.readFileSync(certificatePaths.key);

        return (
            cert.checkHost(host) &&
            cert.checkPrivateKey(createPrivateKey(key)) &&
            certificateHasCommonName(cert, host)
        );
    } catch {
        return false;
    }
}

function certificateHasCommonName(certificate, commonName) {
    return certificate.subject
        .split(/\n/u)
        .some((part) => part.trim() === `CN=${commonName}`);
}

function generateDefaultHttpsCertificate(input) {
    fs.mkdirSync(input.certificatePaths.dir, { recursive: true });

    if (generateOpenSslCertificate(input)) {
        return;
    }

    input.mkcertExecFile(
        input.mkcertBinaryPath,
        [
            "-key-file",
            input.certificatePaths.key,
            "-cert-file",
            input.certificatePaths.cert,
            ...getCertificateHosts(input.hostname),
        ],
        { stdio: "ignore" },
    );
}

function generateOpenSslCertificate(input) {
    const caPaths = getMkcertCAPaths({
        execFile: input.mkcertExecFile,
        mkcertBinaryPath: input.mkcertBinaryPath,
    });

    if (!caPaths) {
        return false;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "budgeted-dev-cert-"));
    const configPath = path.join(tempDir, "openssl.cnf");
    const csrPath = path.join(tempDir, "localhost.csr");

    try {
        fs.writeFileSync(
            configPath,
            createOpenSslCertificateConfig(input.hostname),
        );
        input.opensslExecFile(
            input.opensslBinaryPath,
            [
                "genrsa",
                "-out",
                input.certificatePaths.key,
                "2048",
            ],
            { stdio: "ignore" },
        );
        input.opensslExecFile(
            input.opensslBinaryPath,
            [
                "req",
                "-new",
                "-key",
                input.certificatePaths.key,
                "-out",
                csrPath,
                "-config",
                configPath,
            ],
            { stdio: "ignore" },
        );
        input.opensslExecFile(
            input.opensslBinaryPath,
            [
                "x509",
                "-req",
                "-in",
                csrPath,
                "-CA",
                caPaths.rootCA,
                "-CAkey",
                caPaths.rootCAKey,
                "-set_serial",
                createCertificateSerial(),
                "-days",
                "825",
                "-sha256",
                "-extensions",
                "v3_req",
                "-extfile",
                configPath,
                "-out",
                input.certificatePaths.cert,
            ],
            { stdio: "ignore" },
        );

        return true;
    } catch {
        return false;
    } finally {
        fs.rmSync(tempDir, { force: true, recursive: true });
    }
}

function createOpenSslCertificateConfig(hostname) {
    return [
        "[req]",
        "default_bits = 2048",
        "prompt = no",
        "distinguished_name = req_distinguished_name",
        "req_extensions = v3_req",
        "",
        "[req_distinguished_name]",
        `CN = ${getCertificateCommonName(hostname)}`,
        "",
        "[v3_req]",
        "basicConstraints = CA:FALSE",
        "keyUsage = digitalSignature, keyEncipherment",
        "extendedKeyUsage = serverAuth",
        "subjectAltName = @alt_names",
        "",
        "[alt_names]",
        ...getOpenSslSubjectAltNames(hostname),
        "",
    ].join("\n");
}

function getOpenSslSubjectAltNames(hostname) {
    let dnsIndex = 1;
    let ipIndex = 1;

    return getCertificateHosts(hostname).map((host) => {
        if (isIP(host)) {
            const line = `IP.${ipIndex} = ${host}`;
            ipIndex += 1;
            return line;
        }

        const line = `DNS.${dnsIndex} = ${host}`;
        dnsIndex += 1;
        return line;
    });
}

function createCertificateSerial() {
    return `0x${Date.now().toString(16)}${process.pid.toString(16)}`;
}

function getMkcertRootCA(input) {
    return getMkcertCAPaths(input)?.rootCA;
}

function getMkcertCAPaths(input) {
    try {
        const caRoot = input.execFile(input.mkcertBinaryPath, ["-CAROOT"], {
            encoding: "utf8",
        }).trim();
        const rootCA = path.join(caRoot, "rootCA.pem");
        const rootCAKey = path.join(caRoot, "rootCA-key.pem");

        return fs.existsSync(rootCA) && fs.existsSync(rootCAKey)
            ? { rootCA, rootCAKey }
            : undefined;
    } catch {
        return undefined;
    }
}

function getCertificateValidationHost(hostname) {
    return getCertificateCommonName(hostname);
}

function getCertificateCommonName(hostname) {
    return !hostname || hostname === "0.0.0.0" || hostname === "::"
        ? defaultUrlHostname
        : hostname;
}

function getCertificateHosts(hostname) {
    const defaultHosts = ["localhost", "127.0.0.1", "::1"];

    if (
        !hostname ||
        hostname === "0.0.0.0" ||
        hostname === "::" ||
        defaultHosts.includes(hostname)
    ) {
        return defaultHosts;
    }

    return [...defaultHosts, hostname];
}

function parseLocalEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};
    const contents = fs.readFileSync(filePath, "utf8");

    for (const rawLine of contents.split(/\r?\n/u)) {
        let line = rawLine.trim();

        if (!line || line.startsWith("#")) {
            continue;
        }

        if (line.startsWith("export ")) {
            line = line.slice("export ".length).trim();
        }

        const separatorIndex = line.indexOf("=");

        if (separatorIndex <= 0) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
            continue;
        }

        values[key] = parseEnvValue(line.slice(separatorIndex + 1).trim());
    }

    return values;
}

function parseEnvValue(value) {
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1).replaceAll("\\n", "\n");
    }

    if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1);
    }

    return value.replace(/\s+#.*$/u, "").trim();
}

function readRequiredArgValue(args, index, optionName) {
    const value = args[index + 1];

    if (!value) {
        throw new Error(`${optionName} requires a value.`);
    }

    return value;
}

function readInlineArgValue(arg) {
    const separatorIndex = arg.indexOf("=");

    if (separatorIndex < 0 || separatorIndex === arg.length - 1) {
        throw new Error(`${arg.slice(0, separatorIndex)} requires a value.`);
    }

    return arg.slice(separatorIndex + 1);
}

function normalizeHostname(value) {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        throw new Error("Dev server hostname cannot be empty.");
    }

    if (/^https?:\/\//iu.test(trimmed) || /[/?#]/u.test(trimmed)) {
        throw new Error(
            "Dev server hostname must be a hostname only, not a URL.",
        );
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function normalizePort(value) {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();

    if (!/^\d+$/u.test(trimmed)) {
        throw new Error("Dev server port must be a number.");
    }

    const numericPort = Number(trimmed);

    if (numericPort < 1 || numericPort > 65_535) {
        throw new Error("Dev server port must be between 1 and 65535.");
    }

    return String(numericPort);
}

function normalizeHttps(https, certificateOptions) {
    const hasCertificateOption = Boolean(
        certificateOptions.httpsCa ||
            certificateOptions.httpsCert ||
            certificateOptions.httpsKey,
    );

    return {
        enabled: https ?? hasCertificateOption,
    };
}

function normalizeFilePath(value, optionName) {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        throw new Error(`${optionName} cannot be empty.`);
    }

    return trimmed;
}

function normalizeUrlHostname(hostname) {
    if (!hostname || hostname === "0.0.0.0" || hostname === "::") {
        return defaultUrlHostname;
    }

    return hostname;
}

function formatHostnameForUrl(hostname) {
    return hostname.includes(":") && !hostname.startsWith("[")
        ? `[${hostname}]`
        : hostname;
}
