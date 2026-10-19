/**
 * Arguments passed to the Next.js production build.
 *
 * Turbopack is the default and needs native bindings. Next ships those for
 * desktop Linux, macOS, and Windows. Android does not: Termux is
 * `android/arm64` (32-bit phones report `arm`) and only the WASM bindings
 * load, so that build has to opt into Webpack.
 *
 * `env` is any string environment, not `NodeJS.ProcessEnv`. Next makes
 * `NODE_ENV` required on that type, and this choice only reads Termux markers.
 *
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @param {{ [key: string]: string | undefined }} [env]
 */
export function productionBuildArgs(
  platform = process.platform,
  arch = process.arch,
  env = process.env,
) {
  return usesWebpack(platform, arch, env) ? ["build", "--webpack"] : ["build"];
}

function usesWebpack(platform, arch, env) {
  if (platform === "android") return true;
  return isTermux(env) && isTermuxArch(arch);
}

function isTermux(env) {
  if (env.TERMUX_VERSION) return true;
  if (String(env.PREFIX ?? "").includes("com.termux")) return true;
  return String(env.HOME ?? "").includes("/com.termux/");
}

/** The arches in the Termux failure: android/arm64, and 32-bit android/arm. */
function isTermuxArch(arch) {
  return arch === "arm64" || arch === "arm";
}
