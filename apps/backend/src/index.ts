import { Elysia } from "elysia";
import { node } from "@elysiajs/node";

const PORT = 8081;

const app = new Elysia({ adapter: node() })
  .get("/", () => "Hello Elysia")
  .listen(PORT);

console.log(`🦊 Elysia is running on port ${PORT}`);
