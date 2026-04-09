import React, { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Page, Layout, Card, Text, Button, Banner, BlockStack,
  InlineStack, Box, DropZone, List, Spinner, Badge, Frame, Toast,
} from "@shopify/polaris";

const EU_ALLERGENS = [
  "celery", "gluten", "crustaceans", "eggs", "fish", "lupin",
  "milk", "mustard", "molluscs", "sesame", "soya", "sulphites", "peanuts", "treenuts",
];

const DIETARY = ["vegan", "vegetarian", "halal", "gluten-free", "nut-free", "dairy-free"];

export default function Import() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") || "";

  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [fileName, setFileName] = useState(null);

  const handleDropZoneAccept = useCallback((files) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setCsvText(e.target.result);
    reader.readAsText(file);
  }, []);

  const handleImport = async () => {
    if (!csvText.trim()) {
      setError("Please upload or paste a CSV file first.");
      return;
    }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/allergen/bulk-import?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(json);
        setToast({ content: `Successfully imported ${json.imported} products`, error: false });
        setCsvText("");
        setFileName(null);
      } else if (json.upgrade) {
        setError("CSV import requires the Starter plan or above. Please upgrade on the Dashboard.");
      } else {
        setError(json.error || "Import failed");
      }
    } catch (e) {
      setError("Network error during import");
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const allergenCols = EU_ALLERGENS.join(",");
    const dietaryCols = DIETARY.join(",");
    const header = `productId,productTitle,${allergenCols},${dietaryCols},suitableFor`;
    const example = `gid://shopify/Product/123,Example Product,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,Suitable for most diets`;
    const blob = new Blob([header + "\n" + example + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "allergen-matrix-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Frame>
      {toast && (
        <Toast
          content={toast.content}
          error={toast.error}
          onDismiss={() => setToast(null)}
          duration={4000}
        />
      )}
      <Page
        title="CSV Bulk Import"
        backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="info" title="CSV Import — Starter plan required">
              <Text>
                CSV import is available on Starter ($29/mo) and above. It lets you bulk-upload allergen data
                for all your products at once.
              </Text>
            </Banner>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Step 1 — Download the template</Text>
                <Text>
                  Download the CSV template, fill in your allergen data (true/false for each allergen per product),
                  then upload it below.
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Columns: productId, productTitle, {EU_ALLERGENS.join(", ")}, {DIETARY.join(", ")}, suitableFor
                </Text>
                <Button onClick={downloadTemplate}>Download CSV template</Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Step 2 — Upload your CSV</Text>

                <DropZone
                  accept=".csv,text/csv"
                  type="file"
                  onDrop={(_, accepted) => handleDropZoneAccept(accepted)}
                  allowMultiple={false}
                >
                  <DropZone.FileUpload
                    actionTitle={fileName ? `File: ${fileName}` : "Upload CSV"}
                    actionHint="or drag and drop your .csv file here"
                  />
                </DropZone>

                {fileName && (
                  <InlineStack gap="200">
                    <Badge tone="success">Ready to import</Badge>
                    <Text>{fileName}</Text>
                  </InlineStack>
                )}

                {error && (
                  <Banner tone="critical" title="Import error">
                    <Text>{error}</Text>
                  </Banner>
                )}

                {result && (
                  <Banner tone="success" title={`Import complete — ${result.imported} records imported`}>
                    <Text>Your allergen data has been updated. Visit the Products page to review.</Text>
                  </Banner>
                )}

                <InlineStack align="space-between">
                  <Button
                    primary
                    loading={importing}
                    disabled={!csvText.trim()}
                    onClick={handleImport}
                  >
                    Import allergen data
                  </Button>
                  {result && (
                    <Button onClick={() => navigate(`/products?shop=${shop}`)}>
                      View products
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">CSV Format Reference</Text>
                <Text variant="bodySm">
                  <strong>productId</strong> — Shopify product GID (e.g. gid://shopify/Product/123456789)
                </Text>
                <Text variant="bodySm">
                  <strong>productTitle</strong> — Display name of the product
                </Text>
                <Text variant="bodySm">
                  <strong>Allergen columns</strong> — true if the allergen IS PRESENT, false if absent or not applicable
                </Text>
                <Text variant="bodySm">
                  <strong>Dietary columns</strong> — true if the product qualifies for that dietary category
                </Text>
                <Text variant="bodySm">
                  <strong>suitableFor</strong> — Optional free-text note shown in the matrix
                </Text>

                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <Text variant="bodyXs" fontFamily="mono">
                    {`productId,productTitle,celery,gluten,...\ngid://shopify/Product/123,Smoked Salmon Blinis,false,false,...`}
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
