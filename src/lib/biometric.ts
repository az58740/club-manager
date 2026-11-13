import { M, tr } from "./i18n/messages";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function isBiometricSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    !!navigator.credentials
  );
}

function randomChallenge() {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function biometricErrorText(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") {
    return tr(M.biometric.cancelled);
  }
  if (name === "NotSupportedError" || name === "InvalidStateError") {
    return tr(M.biometric.unsupported);
  }
  if (name === "SecurityError") {
    return tr(M.biometric.secureOrigin);
  }
  return tr(M.biometric.failed);
}

export async function enrollBiometric(user: { id: string; name: string; email: string }) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: tr(M.appName), id: window.location.hostname },
      user: {
        id: encoder.encode(user.id),
        name: user.email || user.id,
        displayName: user.name,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "required",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new DOMException("enrolment did not complete", "NotAllowedError");
  return credential.id;
}

export async function authenticateBiometric(): Promise<string | null> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  const handle = (assertion?.response as AuthenticatorAssertionResponse | undefined)?.userHandle;
  if (!handle) return null;
  return decoder.decode(handle);
}
