import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array } from "@/lib/push";

describe("urlBase64ToUint8Array", () => {
  it("decodes standard base64", () => {
    // "hello" -> aGVsbG8=
    expect([...urlBase64ToUint8Array("aGVsbG8=")]).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });

  it("restores stripped padding", () => {
    // VAPID keys arrive unpadded; atob() throws on those without this.
    expect([...urlBase64ToUint8Array("aGVsbG8")]).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });

  it("translates the base64url alphabet", () => {
    // base64url uses - and _ where base64 uses + and /. Bytes 0xFB 0xFF map to
    // "-_8" in base64url and "+/8" in base64.
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([251, 255]);
    expect([...urlBase64ToUint8Array("+/8=")]).toEqual([251, 255]);
  });

  it("produces a real ArrayBuffer, which PushManager requires", () => {
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it("handles a VAPID-length key without throwing", () => {
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUAM-Ijv1nQ1XjrmPzo";
    const bytes = urlBase64ToUint8Array(key);
    // An uncompressed P-256 point is 65 bytes and starts with 0x04.
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
