const requiredVariables = [
  "CLOUDBASE_ENV_ID",
  "TOKENHUB_BASE_URL",
  "TOKENHUB_API_KEY",
  "TOKENHUB_PRIMARY_MODEL",
  "TOKENHUB_FALLBACK_MODEL",
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENTCLOUD_REGION",
  "ADMIN_OPENIDS",
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missingVariables.length > 0) {
  console.error(`Missing required environment variables: ${missingVariables.join(", ")}`);
  console.error("Copy .env.example to a local untracked file only after each external resource is authorized.");
  process.exitCode = 1;
} else {
  console.log("Environment check passed.");
}

