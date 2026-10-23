/** A build the page doesn't know, from a server that says which build it runs. A dev page never asks. */
export function isNewerBuild(pageBuild: string, serverBuild: unknown): boolean {
  if (pageBuild === "dev") return false;
  if (typeof serverBuild !== "string" || !/^[\w.-]{1,64}$/.test(serverBuild)) return false;
  return serverBuild !== pageBuild;
}
