// Entry point used by Vercel (zero-config Express): the default export is the app.
// Vercel detects the entry by its `express` import, so the API is mounted on a thin outer app.
import express from "express";
import { createApp } from "./create-app";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(createApp());

export default app;
