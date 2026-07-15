// Seller personas for the cold-start catalogue, and the rule that maps a skill
// to one of them. Each persona is a specialist so a buyer landing on a profile
// sees a coherent body of work rather than a random grab-bag.
//
// 'mohan' is deliberately absent — that handle is reserved for the founder's
// real Cognito account.

export const USERS = {
  // ── tapdot's own products ──
  tapdot_labs:     { name: 'Tapdot Labs',      bio: 'Skills distilled from shipped tapdot products — launch pages, browser tools, and desktop apps.', location: 'Mumbai, India', verified: true },
  webcraft_dev:    { name: 'WebCraft Dev',     bio: 'End-to-end web app skills from real production SaaS builds on AWS serverless.', location: 'Mumbai, India', verified: true },
  extension_forge: { name: 'Extension Forge',  bio: 'Chrome extension patterns from shipped MV3 products, including on-device AI.', location: 'Remote', verified: true },
  pipeline_pro:    { name: 'Pipeline Pro',     bio: 'Payments, webhooks, and backend workflow skills battle-tested in production.', location: 'Remote', verified: false },
  oss_distiller:   { name: 'OSS Distiller',    bio: 'Original, opinionated guides for building products on popular open-source projects.', location: 'Remote', verified: false },

  // ── category specialists ──
  stack_atlas:     { name: 'Stack Atlas',      bio: 'Backend and full-stack blueprints. Opinionated defaults, real config, no boilerplate theatre.', location: 'Berlin, Germany', verified: true },
  vector_kitchen:  { name: 'Vector Kitchen',   bio: 'Applied AI engineering — RAG, evals, local inference. Everything measured, nothing hand-waved.', location: 'Bangalore, India', verified: true },
  pixel_charter:   { name: 'Pixel Charter',    bio: 'Design systems, motion, and data-viz that survive contact with a real codebase.', location: 'Tokyo, Japan', verified: false },
  ship_signal:     { name: 'Ship Signal',      bio: 'Launch and growth craft for developer tools. Copy that converts without lying.', location: 'Remote', verified: false },
  edge_render:     { name: 'Edge Render',      bio: 'Web platform work — SSR, static sites, Core Web Vitals, and the SEO that follows.', location: 'Lisbon, Portugal', verified: true },
  pocket_native:   { name: 'Pocket Native',    bio: 'Mobile shipping skills. Cross-platform, offline-first, and store review survival.', location: 'Singapore', verified: false },
  query_forge:     { name: 'Query Forge',      bio: 'Analytics engineering and data pipelines. Query plans over vibes.', location: 'Austin, TX', verified: true },
  deploy_deck:     { name: 'Deploy Deck',      bio: 'Infrastructure, CI/CD, and observability for teams without a platform team.', location: 'Remote', verified: false },
  proof_harness:   { name: 'Proof Harness',    bio: 'Test strategy that catches real regressions instead of padding a coverage number.', location: 'Dublin, Ireland', verified: true },
  paper_press:     { name: 'Paper Press',      bio: 'Documents as a first-class output — PDFs, spreadsheets, typesetting, markdown pipelines.', location: 'Remote', verified: false },
  craft_notes:     { name: 'Craft Notes',      bio: 'The engineering practices around the code: review, incidents, migrations, licensing.', location: 'Remote', verified: false },
};

/* Explicit overrides for the tapdot-authored originals — these must stay with
   the persona that matches the product they came out of. */
const OVERRIDE = {
  'end-to-end-saas-webapp':      'webcraft_dev',
  'node-graph-ui':               'webcraft_dev',
  'playwright-regression-suite': 'webcraft_dev',
  'payment-webhook-integration': 'pipeline_pro',
  'two-sided-matching-engine':   'pipeline_pro',
  'chrome-extension-mv3-basics': 'extension_forge',
  'ondevice-ai-extension':       'extension_forge',
  'writing-tools-extension':     'extension_forge',
  'pdf-generation':              'tapdot_labs',
  'electron-desktop-app':        'tapdot_labs',
  'client-side-tools-site':      'tapdot_labs',
  'calculator-tools':            'tapdot_labs',
  'supabase-saas-backend':       'oss_distiller',
  'shadcn-ui-design-system':     'oss_distiller',
  'playwright-e2e-testing':      'oss_distiller',
  'fastapi-production-backend':  'oss_distiller',
  'node-red-workflow-automation':'oss_distiller',
};

const BY_CATEGORY = {
  Coding:    'stack_atlas',
  'AI/ML':   'vector_kitchen',
  Design:    'pixel_charter',
  Marketing: 'ship_signal',
  Website:   'edge_render',
  Mobile:    'pocket_native',
  Data:      'query_forge',
  DevOps:    'deploy_deck',
  Testing:   'proof_harness',
  Document:  'paper_press',
  Extension: 'extension_forge',
  Desktop:   'tapdot_labs',
  Other:     'craft_notes',
};

export function sellerFor(slug, category) {
  return OVERRIDE[slug] || BY_CATEGORY[category] || 'oss_distiller';
}

/* Featured picks: the strongest one per persona-domain, chosen by hand.
   Featured is a curation signal from the platform — it is our opinion, which
   we are entitled to have, unlike a fabricated download count. */
export const FEATURED = new Set([
  'end-to-end-saas-webapp',
  'ondevice-ai-extension',
  'payment-webhook-integration',
  'pdf-generation',
  'chrome-extension-mv3-basics',
]);
