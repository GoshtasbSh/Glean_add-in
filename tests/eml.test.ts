import { describe, it, expect } from "vitest";
import { parseEml } from "../src/intel/eml";

const SIMPLE = [
  "From: Goshtasb Shahriari <g.shahriarimehr@ufl.edu>",
  "To: Dr Von Meding <j.vonmeding@ufl.edu>",
  "Subject: Re: methodology",
  "Date: Mon, 04 May 2026 10:00:00 +0000",
  "Message-ID: <abc-1@ufl.edu>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Dear Dr Von Meding,",
  "",
  "Thank you for the feedback.",
  "",
  "Best regards,",
  "Goshtasb",
].join("\r\n");

const MULTIPART = [
  "From: g.shahriarimehr@ufl.edu",
  "To: s.mitchell@ufl.edu",
  "Subject: plots",
  'Content-Type: multipart/alternative; boundary="BOUND"',
  "",
  "--BOUND",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hi Sarah, can you rerun the plots?",
  "--BOUND",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Hi Sarah, can you rerun the plots?</p>",
  "--BOUND--",
].join("\r\n");

const QUOTED_PRINTABLE = [
  "From: =?utf-8?Q?Jos=C3=A9?= <jose@ufl.edu>",
  "Subject: =?utf-8?Q?caf=C3=A9?=",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Caf=C3=A9 meeting at 3 =E2=80=94 see you=",
  " there.",
].join("\r\n");

describe("parseEml", () => {
  it("parses headers and body of a simple text/plain message", () => {
    const m = parseEml(SIMPLE);
    expect(m.subject).toBe("Re: methodology");
    expect(m.from?.emailAddress.address).toBe("g.shahriarimehr@ufl.edu");
    expect(m.from?.emailAddress.name).toBe("Goshtasb Shahriari");
    expect(m.toRecipients?.[0].emailAddress.address).toBe("j.vonmeding@ufl.edu");
    expect(m.id).toBe("<abc-1@ufl.edu>");
    expect(m.body?.contentType).toBe("text");
    expect(m.body?.content).toContain("Dear Dr Von Meding,");
    expect(m.body?.content).toContain("Best regards,");
  });

  it("converts the Date header to an ISO sentDateTime", () => {
    const m = parseEml(SIMPLE);
    expect(m.sentDateTime).toBe("2026-05-04T10:00:00.000Z");
  });

  it("prefers the text/plain part of a multipart/alternative message", () => {
    const m = parseEml(MULTIPART);
    expect(m.body?.contentType).toBe("text");
    expect(m.body?.content.trim()).toBe("Hi Sarah, can you rerun the plots?");
  });

  it("decodes quoted-printable body (incl. soft line breaks) and RFC2047 headers", () => {
    const m = parseEml(QUOTED_PRINTABLE);
    expect(m.subject).toBe("café");
    expect(m.from?.emailAddress.name).toBe("José");
    expect(m.body?.content).toContain("Café meeting at 3 — see you there.");
  });

  it("handles a bare address with no display name", () => {
    const m = parseEml(MULTIPART);
    expect(m.from?.emailAddress.address).toBe("g.shahriarimehr@ufl.edu");
    expect(m.toRecipients?.[0].emailAddress.address).toBe("s.mitchell@ufl.edu");
  });

  it("does not throw on a message with no headers", () => {
    const m = parseEml("just some text, no headers");
    expect(m.body?.content).toContain("just some text");
    expect(m.subject).toBe("");
  });

  it("unfolds continuation header lines", () => {
    const folded = [
      "From: g.shahriarimehr@ufl.edu",
      "Subject: a very long",
      " wrapped subject line",
      "",
      "body",
    ].join("\r\n");
    expect(parseEml(folded).subject).toBe("a very long wrapped subject line");
  });
});
