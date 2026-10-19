import { ensurePiper } from "../src/lib/piper";

ensurePiper()
  .then((installed) => {
    console.log("Piper is ready.");
    console.log(`Binary: ${installed.bin}`);
    console.log(`Voice: ${installed.modelName}`);
    console.log(`Model: ${installed.model}`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Piper could not be downloaded.";
    console.error(message);
    process.exit(1);
  });
