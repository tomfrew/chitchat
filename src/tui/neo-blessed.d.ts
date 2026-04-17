// neo-blessed has no types; re-export blessed's types for it.
declare module "neo-blessed" {
  import blessed from "blessed";
  export = blessed;
}
