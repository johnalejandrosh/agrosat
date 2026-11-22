/**
 * Sincronización de imágenes Landsat 8/9 (RF-03). Pensado para ejecutarse de forma programada
 * (cron del servidor, cada día): busca las escenas nuevas de cada parcela, calcula NDVI y NDWI,
 * actualiza el semáforo y envía las alertas por correo.
 *
 *   npm run landsat:sync                    # todas las parcelas, solo fechas nuevas
 *   npm run landsat:sync -- --full          # reprocesa todo el histórico desde LANDSAT_HISTORY_FROM
 *   npm run landsat:sync -- <id> [<id> …]   # solo las parcelas indicadas
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { databaseSchema, databaseUrl } from "../lib/db-url";
import { syncParcels } from "../lib/landsat/process";

const adapter = new PrismaPg({ connectionString: databaseUrl(process.env, { withSchema: false }) }, { schema: databaseSchema() });
const db = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const ids = args.filter((a) => !a.startsWith("--"));
  const started = Date.now();
  const results = await syncParcels(db, {
    trigger: "SCHEDULED",
    full,
    parcelIds: ids.length ? ids : undefined,
    log: (m) => console.log(`· ${m}`),
  });
  const ok = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.filter((r) => r.status === "ERROR");
  console.log(`✔ ${ok} de ${results.length} parcelas sincronizadas en ${Math.round((Date.now() - started) / 1000)} s`);
  for (const f of failed) console.error(`✖ ${f.parcelId}: ${f.message}`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
