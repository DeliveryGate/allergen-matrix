import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Page, Layout, Card, Text, Button, Checkbox, Badge,
  InlineStack, BlockStack, Box, Spinner, Banner, TextField,
  Filters, Thumbnail, Divider, Toast, Frame,
} from "@shopify/polaris";

const EU_ALLERGENS = [
  { key: "celery",      label: "Celery" },
  { key: "gluten",      label: "Gluten" },
  { key: "crustaceans", label: "Crustaceans" },
  { key: "eggs",        label: "Eggs" },
  { key: "fish",        label: "Fish" },
  { key: "lupin",       label: "Lupin" },
  { key: "milk",        label: "Milk" },
  { key: "mustard",     label: "Mustard" },
  { key: "molluscs",    label: "Molluscs" },
  { key: "sesame",      label: "Sesame" },
  { key: "soya",        label: "Soya" },
  { key: "sulphites",   label: "Sulphites" },
  { key: "peanuts",     label: "Peanuts" },
  { key: "treenuts",    label: "Tree Nuts" },
];

const DIETARY = [
  { key: "vegan",       label: "Vegan" },
  { key: "vegetarian",  label: "Vegetarian" },
  { key: "halal",       label: "Halal" },
  { key: "gluten-free", label: "Gluten-free" },
  { key: "nut-free",    label: "Nut-free" },
  { key: "dairy-free",  label: "Dairy-free" },
];

function AllergenEditor({ product, onSave }) {
  const [allergens, setAllergens] = useState(product.allergens || {});
  const [dietary, setDietary] = useState(product.dietary || {});
  const [suitableFor, setSuitableFor] = useState(product.suitableFor || "");
  const [saving, setSaving] = useState(false);

  const toggleAllergen = (key) => setAllergens((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleDietary = (key) => setDietary((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(product.id, product.title, allergens, dietary, suitableFor);
    setSaving(false);
  };

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text variant="headingSm">Allergens Present</Text>
        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="200"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
            {EU_ALLERGENS.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={!!allergens[key]}
                onChange={() => toggleAllergen(key)}
              />
            ))}
          </div>
        </Box>
      </BlockStack>

      <BlockStack gap="200">
        <Text variant="headingSm">Dietary Properties</Text>
        <Box
          background="bg-surface-secondary"
          padding="300"
          borderRadius="200"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px" }}>
            {DIETARY.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={!!dietary[key]}
                onChange={() => toggleDietary(key)}
              />
            ))}
          </div>
        </Box>
      </BlockStack>

      <TextField
        label="Suitable For (optional note)"
        value={suitableFor}
        onChange={setSuitableFor}
        placeholder="e.g. Suitable for most diets, contains no major allergens"
        autoComplete="off"
      />

      <InlineStack align="end">
        <Button primary loading={saving} onClick={handleSave}>
          Save allergen data
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

export default function Products() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") || "";
  const filterParam = searchParams.get("filter") || "";

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [filterMissing, setFilterMissing] = useState(filterParam === "missing");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products?shop=${encodeURIComponent(shop)}`);
      const json = await res.json();
      setProducts(json.products || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (productId, productTitle, allergens, dietary, suitableFor) => {
    const encodedId = encodeURIComponent(productId);
    try {
      const res = await fetch(`/api/allergen/${encodedId}?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productTitle, allergens, dietary, suitableFor }),
      });
      if (res.ok) {
        setToast({ content: `Saved allergen data for "${productTitle}"`, error: false });
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId ? { ...p, allergens, dietary, suitableFor, hasData: true } : p
          )
        );
      } else {
        setToast({ content: "Failed to save", error: true });
      }
    } catch (e) {
      setToast({ content: "Error saving data", error: true });
    }
  };

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.title.toLowerCase().includes(search.toLowerCase());
    const matchesMissing = !filterMissing || !p.hasData;
    return matchesSearch && matchesMissing;
  });

  const allergenSummary = (allergens) => {
    if (!allergens) return <Badge tone="attention">No data</Badge>;
    const present = EU_ALLERGENS.filter((a) => allergens[a.key]).map((a) => a.label);
    if (present.length === 0) return <Badge tone="success">No allergens</Badge>;
    return <Text tone="critical" variant="bodySm">{present.join(", ")}</Text>;
  };

  return (
    <Frame>
      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={() => setToast(null)}
          duration={3000}
        />
      )}
      <Page
        title="Products — Allergen Data"
        backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }}
        primaryAction={{ content: "Import CSV", onAction: () => navigate(`/import?shop=${shop}`) }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      placeholder="Search products..."
                      value={search}
                      onChange={setSearch}
                      clearButton
                      onClearButtonClick={() => setSearch("")}
                      autoComplete="off"
                    />
                  </div>
                  <Checkbox
                    label="Show only products missing data"
                    checked={filterMissing}
                    onChange={() => setFilterMissing((v) => !v)}
                  />
                </InlineStack>

                {loading ? (
                  <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
                ) : (
                  <BlockStack gap="0">
                    {filtered.length === 0 && (
                      <Box padding="400">
                        <Text tone="subdued" alignment="center">No products found</Text>
                      </Box>
                    )}
                    {filtered.map((product, idx) => (
                      <div key={product.id}>
                        {idx > 0 && <Divider />}
                        <Box padding="400">
                          <BlockStack gap="200">
                            <InlineStack align="space-between" gap="400">
                              <InlineStack gap="300" blockAlign="center">
                                {product.image && (
                                  <Thumbnail
                                    source={product.image}
                                    alt={product.title}
                                    size="small"
                                  />
                                )}
                                <BlockStack gap="100">
                                  <Text fontWeight="semibold">{product.title}</Text>
                                  <InlineStack gap="200">
                                    {product.hasData ? (
                                      <Badge tone="success">Data entered</Badge>
                                    ) : (
                                      <Badge tone="attention">Missing data</Badge>
                                    )}
                                    {product.status !== "ACTIVE" && (
                                      <Badge tone="info">{product.status}</Badge>
                                    )}
                                  </InlineStack>
                                  {allergenSummary(product.allergens)}
                                </BlockStack>
                              </InlineStack>
                              <Button
                                size="slim"
                                onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}
                              >
                                {expandedId === product.id ? "Collapse" : "Edit allergens"}
                              </Button>
                            </InlineStack>

                            {expandedId === product.id && (
                              <Box
                                padding="400"
                                background="bg-surface-secondary"
                                borderRadius="200"
                              >
                                <AllergenEditor product={product} onSave={handleSave} />
                              </Box>
                            )}
                          </BlockStack>
                        </Box>
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
