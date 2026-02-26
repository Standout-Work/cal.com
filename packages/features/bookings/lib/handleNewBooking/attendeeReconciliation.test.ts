import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  normalizeLinkedinUrl,
  extractLinkedinUrlFromResponses,
  reconcileAttendeeByLinkedin,
} from "./attendeeReconciliation";

vi.mock("@calcom/prisma", () => {
  return {
    default: {
      attendee: {
        findFirst: vi.fn(),
      },
    },
  };
});

import prisma from "@calcom/prisma";

const mockFindFirst = vi.mocked(prisma.attendee.findFirst);

describe("normalizeLinkedinUrl", () => {
  it("strips https protocol", () => {
    expect(normalizeLinkedinUrl("https://linkedin.com/in/johndoe")).toBe("linkedin.com/in/johndoe");
  });

  it("strips http protocol", () => {
    expect(normalizeLinkedinUrl("http://linkedin.com/in/johndoe")).toBe("linkedin.com/in/johndoe");
  });

  it("strips www prefix", () => {
    expect(normalizeLinkedinUrl("https://www.linkedin.com/in/johndoe")).toBe("linkedin.com/in/johndoe");
  });

  it("strips trailing slash", () => {
    expect(normalizeLinkedinUrl("https://linkedin.com/in/johndoe/")).toBe("linkedin.com/in/johndoe");
  });

  it("lowercases the URL", () => {
    expect(normalizeLinkedinUrl("https://LinkedIn.com/in/JohnDoe")).toBe("linkedin.com/in/johndoe");
  });

  it("trims whitespace", () => {
    expect(normalizeLinkedinUrl("  https://linkedin.com/in/johndoe  ")).toBe("linkedin.com/in/johndoe");
  });

  it("handles already normalized URLs", () => {
    expect(normalizeLinkedinUrl("linkedin.com/in/johndoe")).toBe("linkedin.com/in/johndoe");
  });
});

describe("extractLinkedinUrlFromResponses", () => {
  it("returns null for null responses", () => {
    expect(extractLinkedinUrlFromResponses(null)).toBeNull();
  });

  it("returns null for undefined responses", () => {
    expect(extractLinkedinUrlFromResponses(undefined)).toBeNull();
  });

  it("returns null for empty responses", () => {
    expect(extractLinkedinUrlFromResponses({})).toBeNull();
  });

  it("returns null when no LinkedIn URL is present", () => {
    expect(
      extractLinkedinUrlFromResponses({
        name: "John Doe",
        email: "john@example.com",
        notes: "Looking forward to the call",
      })
    ).toBeNull();
  });

  it('extracts from a field named "linkedin"', () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedin: "https://www.linkedin.com/in/gonzalo-paniagua",
      })
    ).toBe("linkedin.com/in/gonzalo-paniagua");
  });

  it('extracts from a field named "linkedinUrl"', () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedinUrl: "https://linkedin.com/in/gonzalo-paniagua",
      })
    ).toBe("linkedin.com/in/gonzalo-paniagua");
  });

  it('extracts from a field named "linkedin_url"', () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedin_url: "https://linkedin.com/in/gonzalo-paniagua",
      })
    ).toBe("linkedin.com/in/gonzalo-paniagua");
  });

  it('extracts from a field named "linkedinProfile"', () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedinProfile: "https://linkedin.com/in/gonzalo-paniagua",
      })
    ).toBe("linkedin.com/in/gonzalo-paniagua");
  });

  it("falls back to pattern matching on any field", () => {
    expect(
      extractLinkedinUrlFromResponses({
        socialProfile: "https://linkedin.com/in/gonzalo-paniagua",
      })
    ).toBe("linkedin.com/in/gonzalo-paniagua");
  });

  it("ignores non-string values", () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedin: 12345,
        name: "John",
      })
    ).toBeNull();
  });

  it("ignores invalid LinkedIn URLs in named fields", () => {
    expect(
      extractLinkedinUrlFromResponses({
        linkedin: "not-a-linkedin-url",
      })
    ).toBeNull();
  });

  it("prefers named fields over pattern matching", () => {
    const result = extractLinkedinUrlFromResponses({
      linkedin: "https://linkedin.com/in/primary-profile",
      otherField: "https://linkedin.com/in/secondary-profile",
    });
    expect(result).toBe("linkedin.com/in/primary-profile");
  });
});

describe("reconcileAttendeeByLinkedin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no existing attendee is found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await reconcileAttendeeByLinkedin(
      "linkedin.com/in/gonzalo-paniagua",
      "gonzalo.paniagua.sds@gmail.com"
    );

    expect(result).toBeNull();
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { linkedinUrl: "linkedin.com/in/gonzalo-paniagua" },
      select: { email: true, linkedinUrl: true },
      orderBy: { id: "asc" },
    });
  });

  it("returns reconciled data with outreachEmail when emails differ", async () => {
    mockFindFirst.mockResolvedValue({
      email: "gonzalopaniaguasds@gmail.com",
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });

    const result = await reconcileAttendeeByLinkedin(
      "linkedin.com/in/gonzalo-paniagua",
      "gonzalo.paniagua.sds@gmail.com"
    );

    expect(result).toEqual({
      reconciledEmail: "gonzalopaniaguasds@gmail.com",
      outreachEmail: "gonzalo.paniagua.sds@gmail.com",
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });
  });

  it("returns reconciled data with null outreachEmail when emails match", async () => {
    mockFindFirst.mockResolvedValue({
      email: "gonzalo@example.com",
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });

    const result = await reconcileAttendeeByLinkedin(
      "linkedin.com/in/gonzalo-paniagua",
      "gonzalo@example.com"
    );

    expect(result).toEqual({
      reconciledEmail: "gonzalo@example.com",
      outreachEmail: null,
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });
  });

  it("handles case-insensitive email matching", async () => {
    mockFindFirst.mockResolvedValue({
      email: "Gonzalo@Example.com",
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });

    const result = await reconcileAttendeeByLinkedin(
      "linkedin.com/in/gonzalo-paniagua",
      "gonzalo@example.com"
    );

    expect(result).toEqual({
      reconciledEmail: "Gonzalo@Example.com",
      outreachEmail: null,
      linkedinUrl: "linkedin.com/in/gonzalo-paniagua",
    });
  });
});
