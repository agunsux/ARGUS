// Read-only Vercel audit. Secrets remain in memory and are never serialized.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(process.env.APPDATA, 'npm/node_modules/vercel/dist/vc.js');
const link = JSON.parse(fs.readFileSync(path.join(root, '.vercel/project.json')));
function api(route) {
  return JSON.parse(execFileSync(process.execPath, [cli, 'api', route], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25000, maxBuffer: 8 * 1024 * 1024
  }));
}
async function main() {
  const project = api(`/v9/projects/${link.projectId}?teamId=${link.orgId}`);
  const vars = api(`/v10/projects/${link.projectId}/env?teamId=${link.orgId}`);
  const deployments = api(`/v6/deployments?projectId=${link.projectId}&teamId=${link.orgId}&limit=20`);
  const result = { checkedAt: new Date().toISOString(), project: project.name, projectId: project.id,
    ssoProtection: project.ssoProtection, passwordProtectionEnabled: !!project.passwordProtection,
    environmentMetadata: vars.envs.filter(e => /DOKU|DATABASE|MARKETPLACE|PAYMENT|SIMULATION|NODE_ENV/.test(e.key))
      .map(e => ({ key: e.key, target: e.target, gitBranch: e.gitBranch, type: e.type })),
    bypassEntries: Object.entries(project.protectionBypass || {}).map(([, v], i) => ({
      entry: `entry-${i + 1}`, scope: v.scope, createdAt: v.createdAt,
      expiresAt: v.expiresAt ?? null, lastUsedAt: v.lastUsedAt ?? null,
      classification: 'UNKNOWN', metadataFields: Object.keys(v),
      reason: 'Present in configuration; consumer ownership and required ongoing use not established' })),
    deployments: deployments.deployments.map(d => ({ id: d.uid, url: d.url, target: d.target, state: d.state,
      createdAt: d.created, sha: d.meta?.githubCommitSha || d.meta?.gitCommitSha || null,
      branch: d.meta?.githubCommitRef || d.meta?.gitCommitRef || null, metaFields: Object.keys(d.meta || {}) })),
    runtime: [], changes: 'No deployment, environment edits, token creation or revocation' };
  const preview = result.deployments.find(d => d.target !== 'production' && d.state === 'READY');
  if (preview) {
    const detail = api(`/v13/deployments/${preview.id}?teamId=${link.orgId}`);
    result.deploymentDetail = { id: detail.id, url: detail.url, target: detail.target, readyState: detail.readyState,
      gitSource: detail.gitSource, metaFields: Object.keys(detail.meta || {}),
      sha: detail.meta?.githubCommitSha || detail.meta?.gitCommitSha || null };
    const anonymous = await fetch(`https://${preview.url}/health`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    result.anonymousHealth = { status: anonymous.status, redirectHost: anonymous.headers.get('location') ? new URL(anonymous.headers.get('location'), `https://${preview.url}`).hostname : null };
    for (const [i, [secret]] of Object.entries(project.protectionBypass || {}).entries()) {
      const response = await fetch(`https://${preview.url}/api/v1/payments/doku/config`, {
        headers: { 'x-vercel-protection-bypass': secret }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
      let config = null;
      if ((response.headers.get('content-type') || '').includes('application/json')) {
        const data = await response.json();
        config = Object.fromEntries(['success', 'provider', 'environment', 'status', 'is_configured', 'is_sandbox',
          'production_gated', 'production_host_rejected'].map(k => [k, data[k]]));
      }
      result.runtime.push({ entry: `entry-${i + 1}`, route: '/api/v1/payments/doku/config', status: response.status, config });
      result.bypassEntries[i].probe = response.status === 200 && config?.provider === 'doku' ? 'ACCEPTED_FOR_PREVIEW_GET' : 'NOT_CONFIRMED';
      if (i === 0) {
        // No probe=true: this read-only path computes diagnostics but does not contact DOKU.
        const diagnostic = await fetch(`https://${preview.url}/api/v1/payments/sandbox/diagnostics`, {
          headers: { 'x-vercel-protection-bypass': secret }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
        const data = diagnostic.status === 200 ? await diagnostic.json() : {};
        result.runtimeDiagnostics = { status: diagnostic.status,
          applicationAuthenticationSupplied: false, gatewayProbeRequested: false,
          environment: data.envIntegrity?.DOKU_ENV,
          productionFlagReported: data.envIntegrity?.ENABLE_DOKU_PRODUCTION,
          baseUrlIsOfficialSandbox: data.envIntegrity?.DOKU_BASE_URL === 'https://api-sandbox.doku.com',
          dokuVariableNames: data.envIntegrity?.rawEnvKeys,
          caveat: 'Endpoint reports false also when ENABLE_DOKU_PRODUCTION is absent; production_gated is hardcoded in provider status.' };
      }
    }
  }
  fs.writeFileSync(path.join(root, 'evidence/sandbox-safety-vercel.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(`READ_ONLY_AUDIT_FAILED (${error.code || error.name}); raw response suppressed`); process.exitCode = 1; });