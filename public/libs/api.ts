import { treaty } from "@elysiajs/eden";
import { App } from "../../src";

export const api = treaty<App>('localhost:3000')
