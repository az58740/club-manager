const FORMAT = "setaregan-club-backup";
const VERSION = 1;
const ITERATIONS = 600_000;
const MIN_ITERATIONS = 250_000;
const MAX_ITERATIONS = 2_000_000;
const AAD = new TextEncoder().encode(`${FORMAT}:v${VERSION}`);

interface EncryptedBackup {
  format: typeof FORMAT;
  version: typeof VERSION;
  cipher: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asBufferSource(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBackup(plaintext: string, passphrase: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure browser cryptography is unavailable.");
  }
  if (passphrase.length < 10) throw new Error("Backup password must be at least 10 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD, tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedBackup = {
    format: FORMAT,
    version: VERSION,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptBackup(envelopeText: string, passphrase: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Secure browser cryptography is unavailable.");
  }
  let envelope: Partial<EncryptedBackup>;
  try {
    envelope = JSON.parse(envelopeText) as Partial<EncryptedBackup>;
  } catch {
    throw new Error("This is not a recognized encrypted club backup.");
  }
  if (
    envelope.format !== FORMAT ||
    envelope.version !== VERSION ||
    envelope.cipher !== "AES-256-GCM" ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations! < MIN_ITERATIONS ||
    envelope.iterations! > MAX_ITERATIONS ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("This backup format is not supported.");
  }
  try {
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid backup parameters.");
    const key = await deriveKey(passphrase, salt, envelope.iterations!);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asBufferSource(iv),
        additionalData: AAD,
        tagLength: 128,
      },
      key,
      asBufferSource(fromBase64(envelope.ciphertext)),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
  } catch {
    // Do not distinguish a wrong password from a modified/corrupt file.
    throw new Error("Could not unlock this backup. Check the password or choose an intact file.");
  }
}
