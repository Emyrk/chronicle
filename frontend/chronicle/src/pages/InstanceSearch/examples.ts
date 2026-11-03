import type { Node } from "./queryModel";
// Generated from internal/instancesearch/testdata/examples by TestUIExamples.
// Every example is compiled and run against Postgres in the Go tests.
import generated from "./generated/searchExamples.json";

export interface SearchExample {
  id: string;
  title: string;
  category: string;
  description: string;
  where: Node;
}

export const EXAMPLES = generated as unknown as SearchExample[];
