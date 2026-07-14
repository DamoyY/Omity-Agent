import { clearTestArtifacts, testArtifactsRoot } from "./support/artifacts";
import { afterAll } from "bun:test";

clearTestArtifacts();
process.env["TEMP"] = testArtifactsRoot;
process.env["TMP"] = testArtifactsRoot;
process.env["TMPDIR"] = testArtifactsRoot;
afterAll(clearTestArtifacts);
process.once("exit", clearTestArtifacts);
