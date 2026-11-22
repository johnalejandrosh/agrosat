/**
 * Datos iniciales de AgroSat: permisos del sistema, roles, cultivos con umbrales sugeridos
 * y un administrador. Con SEED_DEMO distinto de "false" también crea productores y parcelas
 * de demostración en Chía, Cajicá y Cogua (predios piloto de Sabana Centro).
 *
 * Es idempotente: se puede ejecutar varias veces sin duplicar ni pisar cambios hechos
 * desde la aplicación (lo que ya existe no se modifica).
 *
 *   npm run db:seed          # datos base + demostración
 *   npm run landsat:sync     # descarga las imágenes Landsat de las parcelas y calcula los índices
 *
 * Variables opcionales: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_DEMO.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { DAY_MS } from "../lib/agro/format";
import { DEFAULT_CROPS } from "../lib/agro/crops";
import { areaHa, centroid, closeRing, type LonLat } from "../lib/agro/geo";
import { ADMIN_ROLE_NAME, DEFAULT_ROLE_NAME, SEED_ROLES, SYSTEM_PERMISSIONS, TECH_ROLE_NAME } from "../lib/auth/permissions";
import { databaseSchema, databaseUrl } from "../lib/db-url";
import { hashPassword } from "../lib/server/password";

const adapter = new PrismaPg({ connectionString: databaseUrl(process.env, { withSchema: false }) }, { schema: databaseSchema() });
const db = new PrismaClient({ adapter });

const DEMO_PASSWORD = "demo1234";

/**
 * Productores y parcelas de demostración. Los límites son lotes agrícolas reales
 * (landuse=farmland) de OpenStreetMap © colaboradores de OpenStreetMap, ODbL.
 * Las imágenes y los índices se calculan después con `npm run landsat:sync`.
 */
const DEMO_USERS = [
  { key: "mg", name: "María Gómez", email: "maria.gomez@ejemplo.co", phone: "310 555 0101", municipality: "Chía", role: DEFAULT_ROLE_NAME },
  { key: "cr", name: "Carlos Rincón", email: "carlos.rincon@ejemplo.co", phone: "311 555 0102", municipality: "Cajicá", role: DEFAULT_ROLE_NAME },
  { key: "as", name: "Ana Sierra", email: "ana.sierra@ejemplo.co", phone: "312 555 0103", municipality: "Cogua", role: DEFAULT_ROLE_NAME },
  { key: "jp", name: "Jorge Pinzón", email: "jorge.pinzon@ejemplo.co", phone: "313 555 0104", municipality: "Chía", role: DEFAULT_ROLE_NAME },
  { key: "rc", name: "Rosa Castañeda", email: "rosa.castaneda@ejemplo.co", phone: "314 555 0105", municipality: "Cajicá", role: DEFAULT_ROLE_NAME },
  { key: "dm", name: "Diego Moreno", email: "tecnico@ejemplo.co", phone: "315 555 0106", municipality: "Sabana Centro", role: TECH_ROLE_NAME },
] as const;

const DEMO_PARCELS: { osm: string; owner: string; name: string; crop: string; municipality: string; vereda?: string; sownDaysAgo: number }[] = [
  { osm: "1323229683", owner: "mg", name: "El Alto", crop: "Papa pastusa", municipality: "Chía", vereda: "Fonquetá", sownDaysAgo: 118 },
  { osm: "1323229684", owner: "mg", name: "La Quebrada", crop: "Papa criolla", municipality: "Chía", vereda: "Fonquetá", sownDaysAgo: 82 },
  { osm: "1323229682", owner: "mg", name: "La Huerta", crop: "Lechuga", municipality: "Chía", vereda: "Fonquetá", sownDaysAgo: 45 },
  { osm: "1525033448", owner: "jp", name: "San José", crop: "Papa criolla", municipality: "Chía", vereda: "Fagua", sownDaysAgo: 60 },
  { osm: "104888440", owner: "cr", name: "El Molino", crop: "Zanahoria", municipality: "Cajicá", sownDaysAgo: 98 },
  { osm: "104886738", owner: "cr", name: "Los Pinos", crop: "Brócoli", municipality: "Cajicá", sownDaysAgo: 52 },
  { osm: "104888427", owner: "rc", name: "El Recreo", crop: "Lechuga", municipality: "Cajicá", sownDaysAgo: 40 },
  { osm: "409882146", owner: "as", name: "Lote Grande", crop: "Papa pastusa", municipality: "Cogua", vereda: "Rodamontal", sownDaysAgo: 150 },
  { osm: "372117240", owner: "as", name: "La Ladera", crop: "Arveja", municipality: "Cogua", vereda: "Rodamontal", sownDaysAgo: 75 },
];

async function seedBase() {
  for (const permission of SYSTEM_PERMISSIONS) {
    await db.permission.upsert({
      where: { key: permission.key },
      update: { isSystem: true },
      create: { ...permission, isSystem: true },
    });
  }
  console.log(`✔ ${SYSTEM_PERMISSIONS.length} permisos del sistema`);

  for (const role of SEED_ROLES) {
    const existing = await db.role.findUnique({ where: { name: role.name } });
    if (existing) {
      console.log(`• Rol "${role.name}" ya existe, sin cambios`);
      continue;
    }
    await db.role.create({
      data: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: { create: role.permissions.map((key) => ({ permission: { connect: { key } } })) },
      },
    });
    console.log(`✔ Rol "${role.name}" creado`);
  }

  for (const crop of DEFAULT_CROPS) {
    const existing = await db.crop.findUnique({ where: { name: crop.name } });
    if (!existing) await db.crop.create({ data: crop });
  }
  console.log(`✔ ${DEFAULT_CROPS.length} cultivos con umbrales sugeridos`);

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@agrosat.co").trim().toLowerCase();
  const existingAdmin = await db.user.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log(`• Usuario ${email} ya existe, sin cambios`);
  } else {
    const adminRole = await db.role.findUniqueOrThrow({ where: { name: ADMIN_ROLE_NAME } });
    await db.user.create({
      data: {
        name: "Equipo AgroSat",
        email,
        passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD),
        roleId: adminRole.id,
        dataConsentAt: new Date(),
        emailAlerts: false,
      },
    });
    console.log(`✔ Administrador ${email} creado`);
  }
}

async function seedDemo() {
  const roles = new Map((await db.role.findMany({ select: { id: true, name: true } })).map((r) => [r.name, r.id]));
  const crops = new Map((await db.crop.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]));
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const users = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email }, select: { id: true } });
    const user =
      existing ??
      (await db.user.create({
        data: {
          name: u.name,
          email: u.email,
          phone: u.phone,
          municipality: u.municipality,
          passwordHash,
          roleId: roles.get(u.role)!,
          dataConsentAt: new Date(),
        },
        select: { id: true },
      }));
    users.set(u.key, user.id);
  }
  console.log(`✔ ${DEMO_USERS.length} usuarios de demostración (contraseña: ${DEMO_PASSWORD})`);

  const shapes = JSON.parse(readFileSync(join(__dirname, "demo", "osm-farmland.json"), "utf8")) as Record<string, LonLat[]>;
  let created = 0;
  for (const p of DEMO_PARCELS) {
    const ownerId = users.get(p.owner)!;
    if (await db.parcel.findFirst({ where: { ownerId, name: p.name }, select: { id: true } })) continue;
    const ring = closeRing(shapes[p.osm]);
    const [lon, lat] = centroid(ring);
    const sown = new Date(Date.now() - p.sownDaysAgo * DAY_MS);
    await db.parcel.create({
      data: {
        name: p.name,
        ownerId,
        cropId: crops.get(p.crop)!,
        municipality: p.municipality,
        vereda: p.vereda ?? null,
        sownAt: new Date(Date.UTC(sown.getUTCFullYear(), sown.getUTCMonth(), sown.getUTCDate())),
        boundary: ring,
        areaHa: Math.round(areaHa(ring) * 1000) / 1000,
        centroidLat: lat,
        centroidLon: lon,
      },
    });
    created++;
  }
  console.log(`✔ ${created} parcelas de demostración nuevas (${DEMO_PARCELS.length} en total)`);
  if (created) console.log("→ Ejecuta `npm run landsat:sync` para descargar las imágenes y calcular NDVI y NDWI.");
}

async function main() {
  await seedBase();
  if (process.env.SEED_DEMO !== "false") await seedDemo();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
