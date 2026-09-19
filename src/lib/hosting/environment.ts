export type DeploymentEnvironment = "production" | "preview" | "development";
export type DeploymentEnv = {
  APP_ENV?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

/**
 * Server-only deployment policy, not a client feature flag.
 * APP_ENV is provider-neutral; existing Vercel deployments retain VERCEL_ENV.
 * A production Next build can be a preview, so explicit preview takes priority
 * over NODE_ENV. Missing/invalid configuration outside local dev fails closed.
 */
export function deploymentEnvironment(env: DeploymentEnv = process.env): DeploymentEnvironment {
  const explicit = env.APP_ENV || env.VERCEL_ENV;
  if (explicit) {
    return explicit === "preview" || explicit === "development" ? explicit : "production";
  }
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? "development" : "production";
}

export function isProductionDeployment(env: DeploymentEnv = process.env): boolean {
  return deploymentEnvironment(env) === "production";
}
