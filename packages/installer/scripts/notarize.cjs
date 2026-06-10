// Run by electron-builder via the `afterSign` hook. Notarizes the .app bundle
// with Apple's notary service after signing finishes. Skips silently for
// non-Mac builds, dev builds, and any build where the required env vars are
// missing — so unsigned local builds keep working without env setup.
const path = require("node:path");

exports.default = async function notarize(context) {
  if (context.electronPlatformName !== "darwin") return;

  const required = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(
      `[notarize] Skipping — missing env: ${missing.join(", ")}. ` +
        "Set all three to notarize.",
    );
    return;
  }

  let notarizeFn;
  try {
    ({ notarize: notarizeFn } = require("@electron/notarize"));
  } catch {
    console.log(
      "[notarize] @electron/notarize not installed. Run: npm install --save-optional @electron/notarize",
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appPath} to Apple notary service...`);
  await notarizeFn({
    tool: "notarytool",
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
  console.log("[notarize] Done.");
};
