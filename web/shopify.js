import crypto from "crypto";

export function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

export async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const res = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
  return res.json();
}

export const PLANS = {
  free:       { name: "Free",       price: 0,   productLimit: 20,       features: ["Up to 20 products"] },
  starter:    { name: "Starter",    price: 29,  productLimit: Infinity, features: ["Unlimited products", "CSV import", "Print view", "QR code"] },
  pro:        { name: "Pro",        price: 59,  productLimit: Infinity, features: ["Compliance report export", "Staff training mode", "Custom branding", "US FALCPA format", "Audit log"] },
  enterprise: { name: "Enterprise", price: 199, productLimit: Infinity, features: ["Multi-location", "API access", "Compliance docs", "Priority support"] },
};

export const CREATE_SUBSCRIPTION = `
  mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
      userErrors { field message } confirmationUrl appSubscription { id status }
    }
  }
`;

export const GET_PRODUCTS = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          featuredImage { url altText }
          variants(first: 1) {
            edges { node { id price } }
          }
        }
      }
    }
  }
`;

export async function fetchAllProducts(shop, accessToken) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const variables = { first: 250, ...(cursor ? { after: cursor } : {}) };
    const result = await shopifyGraphQL(shop, accessToken, GET_PRODUCTS, variables);
    const page = result?.data?.products;
    if (!page) break;
    for (const edge of page.edges) {
      products.push(edge.node);
    }
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return products;
}
