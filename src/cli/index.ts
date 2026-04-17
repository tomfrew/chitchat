import { Command } from "commander";
import { runServe } from "./commands/serve.js";
import { runNew } from "./commands/new.js";
import { runLs } from "./commands/ls.js";
import { runStatus } from "./commands/status.js";
import { runShow } from "./commands/show.js";
import { runTail } from "./commands/tail.js";
import { runClose } from "./commands/close.js";
import { runRm } from "./commands/rm.js";

export function buildCli(): Command {
  const program = new Command();
  program
    .name("chitchat")
    .description("Self-hosted MCP server for multi-agent coordination.")
    .version("0.1.0");

  program
    .command("serve")
    .option("-p, --port <port>", "port", (v) => Number(v))
    .action((opts) => runServe({ port: opts.port }));

  program
    .command("new <topic>")
    .option("-d, --description <text>")
    .option("--json")
    .action((topic, opts) => runNew(topic, opts));

  program
    .command("ls")
    .option("--all")
    .option("--json")
    .action((opts) => runLs(opts));

  program
    .command("status")
    .option("--json")
    .action((opts) => runStatus(opts));

  program
    .command("show <ref>")
    .option("--limit <n>", "", (v) => Number(v))
    .option("--json")
    .action((ref, opts) => runShow(ref, opts));

  program.command("tail <ref>").action((ref: string) => runTail(ref));

  program.command("close <ref>").action((ref: string) => runClose(ref));

  program
    .command("rm <ref>")
    .option("-y, --yes")
    .action((ref, opts) => runRm(ref, opts));

  return program;
}
