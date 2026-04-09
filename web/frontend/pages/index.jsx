import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page, Layout, Card, Text, Button, Banner, Badge,
  ProgressBar, BlockStack, InlineStack, Box, Divider,
  DataTable, Spinner,
} from "@shopify/polaris";

const PLAN_COLORS = { free: "info", starter: "success", pro: "warning", enterprise: "critical" };

function PlanBadge({ plan }) {
  return <Badge tone={PLAN_COLORS[plan] || "info"}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</Badge>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [billing, setBilling] = useState(null);
  const [upgrading, setUpgrading] = useState(null);

  const shop = new URLSearchParams(window.location.search).get("shop") || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, billingRes] = await Promise.all([
        fetch(`/api/products?shop=${encodeURIComponent(shop)}`),
        fetch(`/api/billing/status?shop=${encodeURIComponent(shop)}`),
      ]);
      const productsData = await productsRes.json();
      const billingData = await billingRes.json();
      setData(productsData);
      setBilling(billingData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  const handleUpgrade = async (plan) => {
    setUpgrading(plan);
    try {
      const res = await fetch(`/api/billing/subscribe?shop=${encodeURIComponent(shop)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (json.confirmationUrl) {
        window.top.location.href = json.confirmationUrl;
      }
    } catch (e) {
      console.error(e);
    }
    setUpgrading(null);
  };

  if (loading) {
    return (
      <Page title="Allergen Matrix — Food Compliance">
        <Layout><Layout.Section><Card><Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box></Card></Layout.Section></Layout>
      </Page>
    );
  }

  const total = data?.total || 0;
  const completeness = data?.completeness || 0;
  const noData = data?.products?.filter((p) => !p.hasData).length || 0;
  const withData = total - noData;
  const plan = billing?.plan || "free";
  const isFreeLimited = plan === "free" && total > 20;

  const plans = billing?.plans || {};
  const planRows = Object.entries(plans).map(([key, p]) => [
    <InlineStack gap="200" align="start">
      <Text fontWeight="semibold">{p.name}</Text>
      {key === plan && <Badge tone="success">Current</Badge>}
    </InlineStack>,
    `$${p.price}/mo`,
    (p.features || []).join(", "),
    key === "free" || key === plan ? (
      <Text tone="subdued">{key === plan ? "Active" : "Free"}</Text>
    ) : (
      <Button size="slim" primary loading={upgrading === key} onClick={() => handleUpgrade(key)}>
        Upgrade
      </Button>
    ),
  ]);

  return (
    <Page
      title="Allergen Matrix — Food Compliance"
      subtitle="Legally compliant allergen filtering for your Shopify store"
      primaryAction={{ content: "Manage Products", onAction: () => navigate(`/products?shop=${shop}`) }}
      secondaryActions={[
        { content: "Import CSV", onAction: () => navigate(`/import?shop=${shop}`) },
        { content: "Settings", onAction: () => navigate(`/settings?shop=${shop}`) },
      ]}
    >
      <Layout>
        {isFreeLimited && (
          <Layout.Section>
            <Banner
              title={`You have ${total} products but the Free plan supports up to 20`}
              tone="warning"
              action={{ content: "Upgrade to Starter", onAction: () => handleUpgrade("starter") }}
            >
              <Text>Upgrade to Starter ($29/mo) for unlimited products, CSV import, print view, and QR codes.</Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Allergen Data Coverage</Text>
              <InlineStack gap="600">
                <BlockStack gap="100">
                  <Text variant="headingXl" fontWeight="bold">{total}</Text>
                  <Text tone="subdued">Total products</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="headingXl" fontWeight="bold">{withData}</Text>
                  <Text tone="subdued">With allergen data</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="headingXl" fontWeight="bold" tone="critical">{noData}</Text>
                  <Text tone="subdued">Missing data</Text>
                </BlockStack>
              </InlineStack>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text>Completeness</Text>
                  <Text fontWeight="semibold">{completeness}%</Text>
                </InlineStack>
                <ProgressBar progress={completeness} tone={completeness === 100 ? "success" : completeness > 60 ? "highlight" : "critical"} />
              </BlockStack>
              {noData > 0 && (
                <Button onClick={() => navigate(`/products?shop=${shop}&filter=missing`)}>
                  Complete missing data ({noData} products)
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd">Current Plan</Text>
                <PlanBadge plan={plan} />
              </InlineStack>
              <Text>
                {plan === "free"
                  ? "Up to 20 products. Upgrade for unlimited products, CSV import, compliance reports, and more."
                  : `${billing?.features?.join(" · ") || ""}`}
              </Text>
              <Divider />
              <Text variant="headingSm">Compliance Standards</Text>
              <BlockStack gap="100">
                <InlineStack gap="200">
                  <Badge tone="success">UK</Badge>
                  <Text>Natasha's Law (PPDS labelling)</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone="success">EU</Badge>
                  <Text>FIR 1169/2011 (14 major allergens)</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone={plan === "pro" || plan === "enterprise" ? "success" : "info"}>US</Badge>
                  <Text>FALCPA {plan !== "pro" && plan !== "enterprise" ? "(Pro plan)" : ""}</Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Plans</Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Plan", "Price", "Features", "Action"]}
                rows={planRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">About Allergen Matrix</Text>
              <Text>
                Built and proven in production at Vanda's Kitchen, a food business in the City of London
                supplying Selfridges, Accenture, Red Bull, and Epic Games.
              </Text>
              <Text tone="subdued">
                Developer: SaltCore · saltai.app · support@saltai.app
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
