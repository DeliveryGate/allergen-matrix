import express from "express";
import compression from "compression";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import serveStatic from "serve-static";
import {
  verifyWebhookHmac,
  shopifyGraphQL,
  fetchAllProducts,
  PLANS,
  CREATE_SUBSCRIPTION,
} from "./shopify.js";
import { verifyRequest } from "./middleware/verify-request.js";
import {
  parseAllergenCSV,
  generateCSVTemplate,
  computeCompleteness,
  EU_14_ALLERGENS,
  DIETARY_OPTIONS,
} from "./lib/allergenHelpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

app.use(compression());
app.use("/api/webhooks", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => res.json({ status: "ok", app: "allergen-matrix" }));

// ─── Audit helper ────────────────────────────────────────────────────────────
async function audit(shop, action, details) {
  try {
    await prisma.auditLog.create({ data: { shop, action, details: JSON.stringify(details) } });
  } catch (e) { /* non-fatal */ }
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────
app.post("/api/webhooks/:topic", async (req, res) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !verifyWebhookHmac(req.body.toString(), hmac, process.env.SHOPIFY_API_SECRET)) {
    return res.status(401).send("Unauthorized");
  }
  const shop = req.headers["x-shopify-shop-domain"];
  try {
    const topic = req.params.topic;
    if (topic === "app-uninstalled" || topic === "shop-redact") {
      await prisma.productAllergen.deleteMany({ where: { shop } });
      await prisma.auditLog.deleteMany({ where: { shop } });
      await prisma.merchantPlan.deleteMany({ where: { shop } });
      await prisma.session.deleteMany({ where: { shop } });
    }
    // customers-redact and customers-data_request — no PII stored, acknowledge
    res.status(200).send("OK");
  } catch (err) {
    console.error("[webhook] error:", err);
    res.status(500).send("Error");
  }
});

// ─── Products ─────────────────────────────────────────────────────────────────
app.get("/api/products", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  try {
    const shopifyProducts = await fetchAllProducts(shop, accessToken);
    const allergenRows = await prisma.productAllergen.findMany({ where: { shop } });
    const rowMap = {};
    for (const row of allergenRows) rowMap[row.productId] = row;

    const products = shopifyProducts.map((p) => {
      const row = rowMap[p.id] || null;
      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        image: p.featuredImage?.url || null,
        variantId: p.variants?.edges?.[0]?.node?.id || null,
        price: p.variants?.edges?.[0]?.node?.price || null,
        allergens: row ? JSON.parse(row.allergens || "{}") : null,
        dietary: row ? JSON.parse(row.dietary || "{}") : null,
        suitableFor: row?.suitableFor || "",
        hasData: !!row,
      };
    });

    res.json({ products, total: products.length, completeness: computeCompleteness(shopifyProducts, allergenRows) });
  } catch (err) {
    console.error("[api/products] error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

// ─── Single product allergen data ─────────────────────────────────────────────
app.get("/api/allergen/:productId", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const productId = decodeURIComponent(req.params.productId);
  try {
    const row = await prisma.productAllergen.findUnique({ where: { shop_productId: { shop, productId } } });
    if (!row) return res.json({ allergens: {}, dietary: {}, suitableFor: "" });
    res.json({
      allergens: JSON.parse(row.allergens || "{}"),
      dietary: JSON.parse(row.dietary || "{}"),
      suitableFor: row.suitableFor || "",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch allergen data" });
  }
});

app.post("/api/allergen/:productId", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const productId = decodeURIComponent(req.params.productId);
  const { productTitle, allergens, dietary, suitableFor } = req.body;
  try {
    const row = await prisma.productAllergen.upsert({
      where: { shop_productId: { shop, productId } },
      create: {
        shop,
        productId,
        productTitle: productTitle || "",
        allergens: JSON.stringify(allergens || {}),
        dietary: JSON.stringify(dietary || {}),
        suitableFor: suitableFor || "",
      },
      update: {
        productTitle: productTitle || undefined,
        allergens: JSON.stringify(allergens || {}),
        dietary: JSON.stringify(dietary || {}),
        suitableFor: suitableFor || "",
      },
    });
    await audit(shop, "allergen.update", { productId, productTitle });
    res.json({ success: true, id: row.id });
  } catch (err) {
    console.error("[api/allergen] save error:", err);
    res.status(500).json({ error: "Failed to save allergen data" });
  }
});

// ─── Bulk CSV import ───────────────────────────────────────────────────────────
app.post("/api/allergen/bulk-import", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: "No CSV data provided" });

  const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  const plan = merchant?.plan || "free";
  if (plan === "free") return res.status(403).json({ error: "CSV import requires Starter plan or above", upgrade: true });

  try {
    const records = parseAllergenCSV(csv);
    let imported = 0;
    for (const record of records) {
      if (!record.productId) continue;
      await prisma.productAllergen.upsert({
        where: { shop_productId: { shop, productId: record.productId } },
        create: { shop, ...record },
        update: record,
      });
      imported++;
    }
    await audit(shop, "allergen.bulk-import", { count: imported });
    res.json({ success: true, imported });
  } catch (err) {
    console.error("[api/bulk-import] error:", err);
    res.status(500).json({ error: err.message || "Import failed" });
  }
});

app.get("/api/allergen/csv-template", verifyRequest, async (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=allergen-matrix-template.csv");
  res.send(generateCSVTemplate());
});

// ─── Public allergen data for theme extension ──────────────────────────────────
// No auth — public endpoint called from storefront Liquid JS
app.get("/api/public/allergens/:shop", async (req, res) => {
  const shop = req.params.shop;
  if (!shop) return res.status(400).json({ error: "Missing shop" });
  try {
    const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
    const rows = await prisma.productAllergen.findMany({ where: { shop } });
    const products = {};
    for (const row of rows) {
      products[row.productId] = {
        title: row.productTitle,
        allergens: JSON.parse(row.allergens || "{}"),
        dietary: JSON.parse(row.dietary || "{}"),
        suitableFor: row.suitableFor || "",
      };
    }
    res.json({
      products,
      settings: {
        warningMessage: merchant?.warningMessage || "",
        beyond14Message: merchant?.beyond14Message || "",
        pageTitle: merchant?.pageTitle || "Allergen Guide",
        pageIntro: merchant?.pageIntro || "",
        brandColor: merchant?.brandColor || "#309B42",
        enabledAllergens: JSON.parse(merchant?.enabledAllergens || "[]"),
      },
    });
  } catch (err) {
    console.error("[api/public/allergens] error:", err);
    res.status(500).json({ error: "Failed to load allergen data" });
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get("/api/settings", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  const plan = merchant?.plan || "free";
  res.json({
    plan,
    price: PLANS[plan]?.price || 0,
    features: PLANS[plan]?.features || [],
    warningMessage: merchant?.warningMessage || "",
    beyond14Message: merchant?.beyond14Message || "",
    pageTitle: merchant?.pageTitle || "",
    pageIntro: merchant?.pageIntro || "",
    brandColor: merchant?.brandColor || "#309B42",
    enabledAllergens: JSON.parse(merchant?.enabledAllergens || "[]"),
  });
});

app.post("/api/settings", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const { warningMessage, beyond14Message, pageTitle, pageIntro, brandColor, enabledAllergens } = req.body;
  const data = {};
  if (warningMessage !== undefined) data.warningMessage = warningMessage;
  if (beyond14Message !== undefined) data.beyond14Message = beyond14Message;
  if (pageTitle !== undefined) data.pageTitle = pageTitle;
  if (pageIntro !== undefined) data.pageIntro = pageIntro;
  if (brandColor !== undefined) data.brandColor = brandColor;
  if (enabledAllergens !== undefined) data.enabledAllergens = JSON.stringify(enabledAllergens);
  const updated = await prisma.merchantPlan.upsert({ where: { shop }, create: { shop, ...data }, update: data });
  await audit(shop, "settings.update", data);
  res.json({ success: true, ...data });
});

// ─── Billing ──────────────────────────────────────────────────────────────────
app.get("/api/billing/status", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  const plan = merchant?.plan || "free";
  res.json({ plan, price: PLANS[plan]?.price || 0, features: PLANS[plan]?.features || [], plans: PLANS });
});

app.post("/api/billing/subscribe", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const { plan } = req.body;
  if (!plan || !PLANS[plan] || plan === "free") return res.status(400).json({ error: "Invalid plan" });
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/api/billing/callback?shop=${shop}&plan=${plan}`;
  try {
    const result = await shopifyGraphQL(shop, accessToken, CREATE_SUBSCRIPTION, {
      name: `Allergen Matrix ${PLANS[plan].name}`,
      returnUrl,
      test: !IS_PROD,
      lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: PLANS[plan].price, currencyCode: "USD" }, interval: "EVERY_30_DAYS" } } }],
    });
    const { confirmationUrl, userErrors } = result.data.appSubscriptionCreate;
    if (userErrors?.length > 0) return res.status(400).json({ error: "Subscription failed", details: userErrors });
    res.json({ confirmationUrl });
  } catch (err) {
    console.error("[billing/subscribe] error:", err);
    res.status(500).json({ error: "Subscription failed" });
  }
});

app.get("/api/billing/callback", async (req, res) => {
  const { shop, plan, charge_id } = req.query;
  if (charge_id && plan && shop) {
    await prisma.merchantPlan.upsert({
      where: { shop },
      create: { shop, plan, subscriptionId: charge_id },
      update: { plan, subscriptionId: charge_id },
    });
    await audit(shop, "billing.subscribed", { plan, charge_id });
  }
  res.redirect(`/?shop=${shop}`);
});

// ─── Audit log (pro+ only) ────────────────────────────────────────────────────
app.get("/api/audit-log", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  const plan = merchant?.plan || "free";
  if (!["pro", "enterprise"].includes(plan)) return res.status(403).json({ error: "Audit log requires Pro plan", upgrade: true });
  const logs = await prisma.auditLog.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ logs });
});

// ─── Static ───────────────────────────────────────────────────────────────────
if (IS_PROD) {
  app.use(serveStatic(path.join(__dirname, "frontend", "dist")));
  app.get("*", (req, res) => res.sendFile(path.join(__dirname, "frontend", "dist", "index.html")));
}

app.listen(PORT, () => console.log(`Allergen Matrix backend running on port ${PORT}`));
