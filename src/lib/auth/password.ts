import {
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
    return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string) {
    const [salt, expectedHash] = hash.split(":");

    if (!salt || !expectedHash) {
        return false;
    }

    const derivedKey = (await scrypt(password, salt, keyLength)) as Buffer;
    const expectedBuffer = Buffer.from(expectedHash, "hex");

    if (derivedKey.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(derivedKey, expectedBuffer);
}
