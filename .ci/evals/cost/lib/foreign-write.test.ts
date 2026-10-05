import { describe, expect, test } from "bun:test";
import { foreignWriteReason } from "./guard";

const P = "code-agent-workspace/agent-sandbox";
const check = (cmd: string) => foreignWriteReason(cmd, P, "49");

describe("foreignWriteReason", () => {
  test("allows reads anywhere", () => {
    expect(check("curl -s -H 'PRIVATE-TOKEN: x' https://h/api/v4/projects/35/merge_requests")).toBeNull();
  });
  test("allows sandbox writes by encoded path and by id", () => {
    expect(check("curl -X POST https://h/api/v4/projects/code-agent-workspace%2Fagent-sandbox/issues -d x=1")).toBeNull();
    expect(check("curl --request PUT https://h/api/v4/projects/49/merge_requests/2")).toBeNull();
  });
  test("allows variable indirection when the sandbox is named in the command", () => {
    expect(check('P=code-agent-workspace%2Fagent-sandbox; curl -X POST "$B/projects/$P/notes" -d body=x')).toBeNull();
  });
  test("refuses writes to another project", () => {
    expect(check("curl -X POST https://h/api/v4/projects/35/merge_requests/68/notes -d body=x")).toContain("does not target the sandbox");
    expect(check("P=code-agent-workspace%2Fagent-sandbox; curl -X POST https://h/projects/35/notes --data x")).toContain("another project: 35");
  });
  test("refuses writes whose target cannot be seen", () => {
    expect(check('curl -X POST "$B/projects/$PID/merge_requests/$IID/notes" -d body=x')).toContain("does not target the sandbox");
  });
  test("checks git push targets", () => {
    expect(check("git push https://oauth2:t@h/code-agent-workspace/agent-sandbox.git feature/x")).toBeNull();
    expect(check("git -C /w push https://oauth2:t@h/code-agent-workspace/project-workflow-claude-plugin.git x")).toContain("does not target the sandbox");
  });

  const FOREIGN = "https://h/api/v4/projects/36/merge_requests/1/notes";
  test.each([
    `curl -X POST ${FOREIGN}`,
    `curl -XPOST ${FOREIGN}`,
    `curl -sX POST ${FOREIGN}`,
    `curl --request POST ${FOREIGN}`,
    `curl --request=PUT ${FOREIGN}`,
    `curl -X "PATCH" ${FOREIGN}`,
    `curl --request 'DELETE' ${FOREIGN}`,
    `curl -X delete ${FOREIGN}`,
    `curl -d body=x ${FOREIGN}`,
    `curl -d'{"body":"x"}' ${FOREIGN}`,
    `curl -d"body=x" ${FOREIGN}`,
    `curl -d@note.json ${FOREIGN}`,
    `curl -sd body=x ${FOREIGN}`,
    `curl --data body=x ${FOREIGN}`,
    `curl --data=body=x ${FOREIGN}`,
    `curl --data-raw body=x ${FOREIGN}`,
    `curl --data-binary=@f ${FOREIGN}`,
    `curl --data-urlencode body=x ${FOREIGN}`,
    `curl --data-urlencode=body=x ${FOREIGN}`,
    `curl --json '{"body":"x"}' ${FOREIGN}`,
    `curl -F body=x ${FOREIGN}`,
    `curl --form body=x ${FOREIGN}`,
    `curl --form-string body=x ${FOREIGN}`,
    `curl -T note.txt ${FOREIGN}`,
    `curl --upload-file note.txt ${FOREIGN}`,
    `curl -s \\\n  -X POST ${FOREIGN}`,
  ])("refuses foreign write form: %s", (cmd) => {
    expect(check(cmd)).not.toBeNull();
  });
  test.each([
    "glab mr note 1 -R code-agent-workspace/code-agent-workspace-claude-code -m hi",
    "cd /w && glab issue create -t x",
    "GITLAB_TOKEN=t glab api -X POST projects/36/issues",
    "echo $(gh pr comment 1 -b hi)",
    "tea comment 1 hi",
  ])("refuses repository-host CLI without the sandbox: %s", (cmd) => {
    expect(check(cmd)).not.toBeNull();
  });
  test("allows sandbox counterparts of the newer forms", () => {
    expect(check("curl -XPOST https://h/api/v4/projects/49/issues -d'{\"title\":\"x\"}'")).toBeNull();
    expect(check("curl --json '{}' https://h/api/v4/projects/code-agent-workspace%2Fagent-sandbox/issues")).toBeNull();
    expect(check("curl --request=DELETE https://h/api/v4/projects/49/labels/1")).toBeNull();
    expect(check("glab mr note 1 -R code-agent-workspace/agent-sandbox -m hi")).toBeNull();
  });
  test("allows read-only curl with header and dump-header flags", () => {
    expect(check(`curl -s -D - -H 'PRIVATE-TOKEN: x' ${FOREIGN}`)).toBeNull();
    expect(check(`curl -s --dump-header /tmp/h -H "Accept: application/json" ${FOREIGN}`)).toBeNull();
    expect(check(`curl -s ${FOREIGN} | cut -d' ' -f1 | grep -F x`)).toBeNull();
  });
});

describe("foreignWriteReason per-segment targets (review round 2)", () => {
  test("refuses glab -R to another project even when the sandbox is mentioned in the message", () => {
    expect(check('glab mr note 1 -R code-agent-workspace/code-agent-workspace-claude-code -m "see code-agent-workspace/agent-sandbox"')).toContain("another project");
  });
  test("refuses a compound command whose second segment targets another project", () => {
    expect(check("curl -X POST https://h/api/v4/projects/49/issues -d x; glab mr note 1 -R code-agent-workspace/other -m hi")).toContain("another project");
  });
  test("refuses git push to another repo after a sandbox write", () => {
    expect(check("curl -X POST https://h/api/v4/projects/49/notes -d x && git push https://oauth2:t@h/code-agent-workspace/project-workflow-claude-plugin.git x")).toContain("another project");
  });
  test("allows glab -R and git push that target the sandbox", () => {
    expect(check("glab mr note 1 -R code-agent-workspace/agent-sandbox -m hi")).toBeNull();
    expect(check("git push https://oauth2:t@h/code-agent-workspace/agent-sandbox.git feature/x")).toBeNull();
    expect(check("git push git@h:code-agent-workspace/agent-sandbox.git feature/x")).toBeNull();
  });
  test("still allows variable indirection named elsewhere in the command", () => {
    expect(check('P=code-agent-workspace%2Fagent-sandbox; curl -X POST "$B/projects/$P/notes" -d body=x')).toBeNull();
  });
});

describe("foreignWriteReason target forms (review round 3)", () => {
  test("refuses ssh:// push URLs to another project", () => {
    expect(check("git push ssh://git@h/code-agent-workspace/other.git x # code-agent-workspace/agent-sandbox")).toContain("another project");
  });
  test("refuses the glued -R<path> form", () => {
    expect(check("glab mr note 1 -Rcode-agent-workspace/other -m code-agent-workspace/agent-sandbox")).toContain("another project");
  });
  test("reads full-URL -R values as project paths", () => {
    expect(check("glab mr note 1 -R https://h/code-agent-workspace/other -m code-agent-workspace/agent-sandbox")).toContain("code-agent-workspace/other");
    expect(check("glab mr note 1 -R https://h/code-agent-workspace/agent-sandbox -m hi")).toBeNull();
  });
  test("allows ssh:// push to the sandbox", () => {
    expect(check("git push ssh://git@h/code-agent-workspace/agent-sandbox.git x")).toBeNull();
  });
});
