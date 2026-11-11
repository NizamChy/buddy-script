// Long-running server for local development / container hosting.
import { createApp } from "./create-app";
import { env } from "./config/env";

createApp().listen(env.PORT, () => {
  console.log(`Buddy Script API listening on http://localhost:${env.PORT}`);
});
