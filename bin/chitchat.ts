#!/usr/bin/env bun
import { buildCli } from "../src/cli/index.js";

buildCli()
  .parseAsync(process.argv)
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
