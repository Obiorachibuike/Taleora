import { describe, it, expect } from "vitest";
import { validateProviderUrl } from "@/lib/security/ssrf";

describe("validateProviderUrl", () => {
  it("rejects localhost unless allowLocalHttp", () => {
    const r = validateProviderUrl("http://localhost:8080/v1");
    expect(r.ok).toBe(false);
    const r2 = validateProviderUrl("http://localhost:8080/v1", { allowLocalHttp: true });
    expect(r2.ok).toBe(true);
  });

  it("rejects private IPs and metadata ranges", () => {
    expect(validateProviderUrl("http://169.254.169.254/latest/meta-data", { allowPrivate: false, allowLocalHttp: true }).ok).toBe(false);
    // 127.0.0.1 is intentionally allowed by allowLocalHttp in dev mode
    expect(validateProviderUrl("http://127.0.0.1/", { allowLocalHttp: true }).ok).toBe(true);
    expect(validateProviderUrl("http://10.0.0.5/", { allowLocalHttp: true }).ok).toBe(false);
    expect(validateProviderUrl("http://192.168.1.1/", { allowLocalHttp: true }).ok).toBe(false);
    expect(validateProviderUrl("http://172.16.0.1/", { allowLocalHttp: true }).ok).toBe(false);
  });

  it("rejects non-http schemes", () => {
    expect(validateProviderUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateProviderUrl("ftp://example.com").ok).toBe(false);
  });

  it("accepts public https URLs and normalizes them", () => {
    const r = validateProviderUrl("https://api.example.com/v1/");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("https://api.example.com/v1");
    const r2 = validateProviderUrl("https://apihub.agnes-ai.com/v1");
    expect(r2.ok).toBe(true);
  });

  it("allows http:// only with allowLocalHttp", () => {
    expect(validateProviderUrl("http://api.example.com/v1").ok).toBe(false);
    expect(validateProviderUrl("http://api.example.com/v1", { allowLocalHttp: true }).ok).toBe(true);
  });

  it("strips credentials from the URL", () => {
    const r = validateProviderUrl("https://user:pass@api.example.com/v1");
    expect(r.ok).toBe(true);
    expect(r.normalized ?? "").not.toContain("user");
  });
});
