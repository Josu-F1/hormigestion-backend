import { cp, mkdir } from "node:fs/promises";
await mkdir("dist/infrastructure/database/migrations", { recursive: true });
await cp("src/infrastructure/database/migrations", "dist/infrastructure/database/migrations", { recursive: true });
await cp("src/infrastructure/assets", "dist/infrastructure/assets", { recursive: true });
