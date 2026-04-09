import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Page, Layout, Card, Text, Button, TextField, Checkbox,
  BlockStack, InlineStack, Box, ColorPicker, hsbToHex, hexToRgb,
  Spinner, Toast, Frame, Banner, Divider, Badge,
} from "@shopify/polaris";

const EU_ALLERGENS = [
  { key: "celery",      label: "Celery" },
  { key: "gluten",      label: "Gluten (cereals)" },
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

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shop = searchParams.get("shop") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [plan, setPlan] = useState("free");

  const [warningMessage, setWarningMessage] = useState("");
  const [beyond14Message, setBeyond14Message] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [pageIntro, setPageIntro] = useState("");
  const [brandColor, setBrandColor] = useState("#309B42");
  const [enabledAllergens, setEnabledAllergens] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings?shop=${encodeURIComponent(shop)}`);
      const json = await res.json();
      setPlan(json.plan || "free");
      setWarningMessage(json.warningMessage || "");
      setBeyond14Message(json.beyond14Message || "");
      setPageTitle(json.pageTitle || "");
      setPageIntro(json.pageIntro || "");
      setBrandColor(json.brandColor || "#309B42");
      setEnabledAllergens(json.enabledAllergens || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warningMessage, beyond14Message, pageTitle, pageIntro, brandColor, enabledAllergens }),
      });
      if (res.ok) {
        setToast({ content: "Settings saved", error: false });
      } else {
        setToast({ content: "Failed to save settings", error: true });
      }
    } catch (e) {
      setToast({ content: "Error saving settings", error: true });
    }
    setSaving(false);
  };

  const toggleAllergen = (key) => {
    setEnabledAllergens((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const allEnabled = enabledAllergens.length === 0; // empty means all enabled (default)

  if (loading) {
    return (
      <Page title="Settings">
        <Layout><Layout.Section><Card><Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box></Card></Layout.Section></Layout>
      </Page>
    );
  }

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
        title="Settings"
        backAction={{ content: "Dashboard", onAction: () => navigate(`/?shop=${shop}`) }}
        primaryAction={{ content: "Save settings", loading: saving, onAction: handleSave }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd">Page Content</Text>
                  <Badge tone="info">Shown on storefront</Badge>
                </InlineStack>

                <TextField
                  label="Page Title"
                  value={pageTitle}
                  onChange={setPageTitle}
                  placeholder="Allergen Guide"
                  helpText="Shown as the main heading on the allergen matrix page"
                  autoComplete="off"
                />

                <TextField
                  label="Page Introduction"
                  value={pageIntro}
                  onChange={setPageIntro}
                  placeholder="Use this guide to check allergens and filter products that suit your needs."
                  helpText="Short intro paragraph shown below the page title"
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Warning Messages</Text>

                <TextField
                  label="Allergen Warning Message"
                  value={warningMessage}
                  onChange={setWarningMessage}
                  placeholder="If you have a severe allergy, please contact us before ordering."
                  helpText='Shown in the "Important" card on the allergen matrix page'
                  multiline={3}
                  autoComplete="off"
                />

                <TextField
                  label="Beyond 14 Allergens Message"
                  value={beyond14Message}
                  onChange={setBeyond14Message}
                  placeholder="If you react to ingredients beyond the 14 major allergens, please contact us."
                  helpText="Shown in the 'Beyond the 14 major allergens' information card"
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd">Brand Colour</Text>
                  {plan === "free" && <Badge tone="attention">Pro plan feature</Badge>}
                </InlineStack>
                {plan === "free" ? (
                  <Banner tone="info">
                    <Text>Custom branding is available on the Pro plan ($59/mo). Upgrade to use your brand colour throughout the matrix.</Text>
                  </Banner>
                ) : (
                  <BlockStack gap="200">
                    <TextField
                      label="Hex colour"
                      value={brandColor}
                      onChange={setBrandColor}
                      placeholder="#309B42"
                      helpText="Used for buttons, highlights, and accents in the allergen matrix"
                      autoComplete="off"
                    />
                    <InlineStack gap="200" blockAlign="center">
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: brandColor,
                          border: "1px solid #ddd",
                        }}
                      />
                      <Text tone="subdued">Preview</Text>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text variant="headingMd">Enabled Allergens</Text>
                  <Text tone="subdued">
                    Choose which allergens to display in your matrix. Leave all unchecked to show all 14.
                    {allEnabled && " (Currently showing all allergens.)"}
                  </Text>
                </BlockStack>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
                  {EU_ALLERGENS.map(({ key, label }) => (
                    <Checkbox
                      key={key}
                      label={label}
                      checked={enabledAllergens.includes(key)}
                      onChange={() => toggleAllergen(key)}
                    />
                  ))}
                </div>

                <InlineStack gap="200">
                  <Button size="slim" onClick={() => setEnabledAllergens(EU_ALLERGENS.map((a) => a.key))}>
                    Select all
                  </Button>
                  <Button size="slim" onClick={() => setEnabledAllergens([])}>
                    Clear (show all)
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <InlineStack align="end">
              <Button primary loading={saving} onClick={handleSave}>
                Save settings
              </Button>
            </InlineStack>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
