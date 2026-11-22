# AgroSat · MVP

Plataforma web para el monitoreo del estado de los cultivos de pequeños y medianos productores de
Sabana Centro (Cundinamarca) a partir de la reflectancia superficial de **Landsat 8 y 9**.
Calcula por parcela el **NDVI** (vigor) y el **NDWI** (agua en las hojas), los muestra en mapas y series
de tiempo y los convierte en un **semáforo** y en **alertas tempranas** por correo.

Proyecto de grado UNAD · John Alejandro Hernández Rodríguez y Jefferson Steven Remolina Sepúlveda.

## Puesta en marcha

```bash
cp .env.example .env          # complete DB_* (PostgreSQL) y, si quiere, SMTP_* y CRON_SECRET
npm install                   # también genera el cliente de Prisma
npm run db:deploy             # crea las tablas en el esquema DB_SHEMA
npm run db:seed               # permisos, roles, cultivos, administrador y datos de demostración
npm run landsat:sync          # descarga las imágenes de las parcelas demo y calcula los índices (~5 min)
npm run dev                   # http://localhost:3000
```

Cuentas de demostración (contraseña `demo1234`, con acceso rápido en la pantalla de inicio de sesión en desarrollo):

| Rol | Correo | Qué ve |
| --- | --- | --- |
| Productora | `maria.gomez@ejemplo.co` | Sus 3 parcelas en Chía, mapa, alertas |
| Técnico | `tecnico@ejemplo.co` | Además, el seguimiento de las 9 parcelas |
| Administrador | `admin@agrosat.co` | Todo: umbrales, procesamiento, usuarios, roles |

Las parcelas de demostración son lotes agrícolas reales de OpenStreetMap (`landuse=farmland`) en Chía,
Cajicá y Cogua; sus índices son los **reales** calculados con Landsat desde 2021.

## Qué hace (requerimientos del documento)

| RF | Dónde |
| --- | --- |
| RF-01 Registro e inicio de sesión (nombre, correo, teléfono, autorización Ley 1581) | `/register`, `/login` |
| RF-02 Registrar parcela dibujando en el mapa (vista satélite) o con coordenadas | `/dashboard/parcelas/nueva` |
| RF-03 Descarga automática de imágenes Landsat 8/9 (STAC) | `lib/landsat/*`, `npm run landsat:sync`, `/api/cron/landsat` |
| RF-04 Máscara de nubes y sombras con QA_PIXEL | `lib/landsat/raster.ts` |
| RF-05 NDVI y NDWI por parcela y fecha | `lib/landsat/raster.ts` → tabla `observations` |
| RF-06 Mapa con los píxeles de 30 m coloreados por índice | `/dashboard/mapa`, detalle de parcela |
| RF-07 Series de tiempo | detalle de parcela (Chart.js) |
| RF-08 Semáforo verde / amarillo / rojo | `lib/agro/status.ts` |
| RF-09 Alertas tempranas por correo | `lib/alerts/*` (nodemailer; sin SMTP quedan registradas) |
| RF-10 Historial de alertas | `/dashboard/alertas` |
| RF-11 Reporte PDF | detalle de parcela → «Descargar reporte PDF» (impresión del navegador) |
| RF-12 Administración de usuarios y umbrales por cultivo | `/dashboard/usuarios`, `/dashboard/cultivos` |

Además: seguimiento técnico de varias parcelas ordenadas por prioridad (`/dashboard/seguimiento`),
bitácora del procesamiento (`/dashboard/procesamiento`), roles y permisos configurables, modo oscuro y
diseño responsivo (RNF-02).

## Cómo se procesan las imágenes

1. Se busca en el catálogo STAC de **Microsoft Planetary Computer** (colección `landsat-c2-l2`) cada escena
   Landsat 8/9 que cubre la parcela desde `LANDSAT_HISTORY_FROM` (2021-01-01). En el traslape de dos filas
   WRS se conserva una escena por fecha.
2. De cada escena se leen solo los bloques del COG que tocan la parcela (lecturas por rango HTTP con
   `geotiff`); la parcela se proyecta a la UTM de la escena con `proj4`.
3. Se toman los píxeles de 30 m cuyo centro cae dentro del polígono y se descartan los marcados en
   `QA_PIXEL` como nube, nube dilatada, cirro, sombra o nieve. La fecha es válida si queda limpio al
   menos el 50 % de la parcela; solo entonces se descargan B4, B5 y B6.
4. Reflectancia = DN × 0,0000275 − 0,2; NDVI = (B5 − B4)/(B5 + B4); NDWI = (B5 − B6)/(B5 + B6).
5. Con las observaciones válidas y los umbrales del cultivo se recalculan las alertas: solo en la etapa de
   desarrollo (30 %–80 % del ciclo desde la siembra), se abre una alerta cuando el semáforo empeora y se
   cierra cuando vuelve a verde. Solo se avisa por correo de imágenes recientes (no del histórico).

Al registrar o redibujar una parcela el procesamiento corre en segundo plano (`after()` de Next.js) y la
página muestra el avance. Para la actualización periódica programe en el servidor, por ejemplo a diario:

```cron
30 6 * * *  cd /ruta/agrosat && npm run landsat:sync >> /var/log/agrosat-sync.log 2>&1
```

o llame a `GET /api/cron/landsat` con `Authorization: Bearer $CRON_SECRET`.

## Arquitectura

- **Next.js 16** (App Router, Server Components, Server Actions, Cache Components) + **React 19**.
- **CoreUI 5** (SCSS propio, tema «Campo») · **Leaflet** + OpenStreetMap / Esri World Imagery · **Chart.js**.
- **PostgreSQL** con **Prisma 7** (esquema `DB_SHEMA`). Autenticación propia con sesiones en base de datos,
  contraseñas con scrypt y control de acceso por permisos (DAL en `lib/server/dal.ts`).
- Procesamiento satelital en TypeScript (`geotiff`, `proj4`), sin dependencias de Python ni GDAL.

```
app/(auth)          login y registro
app/(dashboard)     inicio, parcelas, mapa, alertas, seguimiento, cultivos, procesamiento, usuarios…
app/api             píxeles para los mapas, cron de Landsat, sesión expirada
lib/agro            dominio puro: geometría, semáforo, etapas, escalas de color, formatos
lib/landsat         STAC, lectura de bandas, índices y orquestación
lib/alerts          motor de alertas y correo
lib/server          consultas, DAL, sesiones, Prisma
prisma              esquema, migraciones y seed (con lotes demo de OpenStreetMap)
scripts             landsat-sync.ts
```

### Diferencias con el documento

- El documento propone backend NestJS + procesamiento en Python (GDAL, Rasterio). El MVP parte de la
  plantilla Next.js existente y hace el procesamiento en TypeScript dentro de la misma aplicación, con el
  mismo método (STAC, COG, QA_PIXEL, B4/B5/B6). Si el volumen crece, `lib/landsat` se puede mover a un
  servicio aparte sin cambiar la base de datos.
- El servidor PostgreSQL actual no tiene la extensión **PostGIS**; la geometría de cada parcela se guarda
  como GeoJSON (`parcels.boundary`) junto con su área y centroide. Al habilitar PostGIS se puede agregar una
  columna `geometry` derivada.
- El módulo de «Plagas y enfermedades» de los wireframes queda fuera: el documento lo excluye del alcance
  (no se diagnostican plagas específicas).

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:migrate` | Nueva migración en desarrollo |
| `npm run db:deploy` | Aplica migraciones |
| `npm run db:seed` | Datos iniciales (idempotente; `SEED_DEMO=false` omite la demostración) |
| `npm run landsat:sync [-- --full] [ids…]` | Sincroniza imágenes de todas o algunas parcelas |

Datos: Landsat 8-9 OLI/TIRS Collection 2 Level-2 (USGS/NASA) vía Microsoft Planetary Computer ·
Mapas © colaboradores de OpenStreetMap · Imágenes satelitales base © Esri.
