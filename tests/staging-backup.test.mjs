import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const script = readFileSync("scripts/export-staging-backup.sh","utf8");
const workflow = readFileSync(".github/workflows/authorized-staging-backup.yml","utf8");
test("staging backup rejects PR and unconfirmed execution", () => {
  for (const [ref,event,confirmation] of [["refs/heads/feature","workflow_dispatch","BACKUP"],["refs/heads/main","push","BACKUP"],["refs/heads/main","workflow_dispatch","NO"]]) {
    assert.equal(spawnSync("bash",["scripts/export-staging-backup.sh"],{env:{...process.env,GITHUB_REF:ref,GITHUB_EVENT_NAME:event,BACKUP_CONFIRMATION:confirmation}}).status,1);
  }
});
test("staging backup is protected and uploads ciphertext only", () => {
  assert.match(workflow,/environment: staging-backup/);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow,/pull_request:|push:|schedule:/);
  assert.match(script,/age -r "\$BACKUP_RECIPIENT"/);
  assert.match(script,/--role-only/);
  assert.match(script,/--use-copy --data-only/);
  assert.match(script,/supabase_migrations/);
  assert.doesNotMatch(workflow.split("actions/upload-artifact")[1],/\.sql|tool.log/);
});

test("staging backup compresses the tar stream before Age encryption", () => {
  assert.match(script, /tar [^\n]+ \| gzip -n \| age -r "\$BACKUP_RECIPIENT" -o "\$work\/encrypted\/backup\.tar\.gz\.age"/);
  assert.match(script, /sha256sum backup\.tar\.gz\.age > backup\.tar\.gz\.age\.sha256/);
  const uploadedPaths = workflow.split("path: |")[1].split("retention-days:")[0].trim().split(/\n\s*/);
  const artifactDir = "${{ runner.temp }}/encrypted-staging-backup";
  assert.deepEqual(uploadedPaths, [
    artifactDir + "/backup.tar.gz.age",
    artifactDir + "/backup.tar.gz.age.sha256",
  ]);
});

test("connection diagnostics reject invalid configuration without leaking credentials", () => {
  const base = "postgresql://postgres.phiscfwfuzeptetimdbo:fixture-secret@fixture.pooler.supabase.com:5432/postgres?sslmode=require";
  const cases = [
    [base.replace("postgresql:", "http:"), "invalid connection protocol"],
    [base.replace("phiscfwfuzeptetimdbo", "awalptqpsjflrahkrjzk"), "incorrect staging project username"],
    [base.replace("fixture.pooler.supabase.com", "example.invalid"), "invalid session pooler hostname"],
    [base.replace(":5432", ":6543"), "expected session pooler port 5432"],
    [base.replace("/postgres?", "/other?"), "incorrect database name"],
    [base.replace(":fixture-secret@", "@"), "missing password"],
    [base.replace("sslmode=require", "sslmode=disable"), "expected sslmode=require"],
    [base + "&extra=fixture-secret", "expected sslmode=require"],
    [base.replace(":5432", ":fixture-secret"), "malformed connection string"],
  ];
  for (const [url, reason] of cases) {
    const result = spawnSync("bash", ["scripts/export-staging-backup.sh"], {
      encoding: "utf8",
      env: {...process.env, GITHUB_REF:"refs/heads/main", GITHUB_EVENT_NAME:"workflow_dispatch",
        BACKUP_CONFIRMATION:"BACKUP", STAGING_DB_URL:url, BACKUP_RECIPIENT:"invalid",
        BACKUP_OUTPUT:"unused-diagnostic-output"}
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes("Unexpected staging connection configuration: " + reason));
    assert.doesNotMatch(result.stderr, /fixture-secret|postgresql:\/\/|Traceback/);
  }
});
