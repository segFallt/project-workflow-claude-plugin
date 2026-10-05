import { describe, expect, test } from "bun:test";
import { filterEnv, operatorSteps, pushUrl } from "./seed";

describe("filterEnv", () => {
  test("keeps only the allowed keys, first occurrence, export prefix tolerated", () => {
    const src = [
      "# comment",
      "API_TOKEN_ENV_VAR=fake-api-token",
      "export REVIEW_TOKEN_ENV_VAR=fake-review-token",
      "OTHER_SECRET=fake-other",
      "API_TOKEN_ENV_VAR=fake-duplicate",
      "REPO_HOST_URL=https://gitlab.example.test",
    ].join("\n");
    const { content, found } = filterEnv(src);
    expect(found).toEqual(["API_TOKEN_ENV_VAR", "REVIEW_TOKEN_ENV_VAR", "REPO_HOST_URL"]);
    expect(content).toBe(
      "API_TOKEN_ENV_VAR=fake-api-token\nexport REVIEW_TOKEN_ENV_VAR=fake-review-token\nREPO_HOST_URL=https://gitlab.example.test\n",
    );
    expect(content).not.toContain("OTHER_SECRET");
  });
});

describe("operator steps", () => {
  test("push URL keeps the token a variable and uses the configured host and project", () => {
    expect(pushUrl("grp/sub/proj", "https://gitlab.example.test")).toBe(
      "https://oauth2:$API_TOKEN_ENV_VAR@gitlab.example.test/grp/sub/proj.git",
    );
  });
  test("push and MR commands target the same host and project", () => {
    const [, push, mr] = operatorSteps("/s", "grp/proj", "https://gitlab.example.test:8443");
    expect(push).toContain('"https://oauth2:$API_TOKEN_ENV_VAR@gitlab.example.test:8443/grp/proj.git"');
    expect(push).toContain("# no -u");
    expect(mr).toContain("https://gitlab.example.test:8443/api/v4/projects/grp%2Fproj/merge_requests");
    expect([push, mr].join()).not.toContain("pingleberry");
  });
});
