// Allergen and dietary constants

export const EU_14_ALLERGENS = [
  "celery",
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "lupin",
  "milk",
  "mustard",
  "molluscs",
  "sesame",
  "soya",
  "sulphites",
  "peanuts",
  "treenuts",
];

export const ALLERGEN_LABELS = {
  celery: "Celery",
  gluten: "Gluten (cereals)",
  crustaceans: "Crustaceans",
  eggs: "Eggs",
  fish: "Fish",
  lupin: "Lupin",
  milk: "Milk",
  mustard: "Mustard",
  molluscs: "Molluscs",
  sesame: "Sesame",
  soya: "Soya",
  sulphites: "Sulphites",
  peanuts: "Peanuts",
  treenuts: "Tree Nuts",
};

export const DIETARY_OPTIONS = [
  "vegan",
  "vegetarian",
  "halal",
  "gluten-free",
  "nut-free",
  "dairy-free",
];

// Compute completeness % for a shop's allergen data
export function computeCompleteness(products, allergenRows) {
  if (!products || products.length === 0) return 0;
  const rowMap = {};
  for (const row of allergenRows) rowMap[row.productId] = row;
  let filled = 0;
  for (const p of products) {
    if (rowMap[p.id]) filled++;
  }
  return Math.round((filled / products.length) * 100);
}

// Parse CSV text into allergen records
// Expected columns: productId, productTitle, celery, gluten, crustaceans, eggs, fish, lupin,
//                   milk, mustard, molluscs, sesame, soya, sulphites, peanuts, treenuts,
//                   vegan, vegetarian, halal, gluten-free, nut-free, dairy-free, suitableFor
export function parseAllergenCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""));
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || "").trim(); });

    if (!row.productid) continue;

    const allergens = {};
    for (const key of EU_14_ALLERGENS) {
      const val = row[key] || row[key.replace("-", "")] || "";
      allergens[key] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "yes";
    }

    const dietary = {};
    for (const key of DIETARY_OPTIONS) {
      const col = key.replace("-", "");
      const val = row[col] || row[key] || "";
      dietary[key] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "yes";
    }

    records.push({
      productId: row.productid,
      productTitle: row.producttitle || "",
      allergens: JSON.stringify(allergens),
      dietary: JSON.stringify(dietary),
      suitableFor: row.suitablefor || "",
    });
  }

  return records;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Generate CSV template with headers
export function generateCSVTemplate() {
  const allergenCols = EU_14_ALLERGENS.join(",");
  const dietaryCols = DIETARY_OPTIONS.join(",");
  const header = `productId,productTitle,${allergenCols},${dietaryCols},suitableFor`;
  const example = `gid://shopify/Product/123,Example Product,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,Suitable for most diets`;
  return `${header}\n${example}\n`;
}
