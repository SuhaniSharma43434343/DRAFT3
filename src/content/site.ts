// All copy comes from content/sav-prime-content.md. Do not add facts here.

export const company = {
  name: "SAV Prime General Trading LLC",
  short: "SAV Prime",
  tagline: ["Connecting Markets.", "Moving Commodities.", "Building Relationships."],
  location: "Dubai, United Arab Emirates",
};

// Owner has not supplied these yet. Empty values show as "To be confirmed" on the page.
export const contact: { email: string; phone: string; address: string } = {
  email: "",
  phone: "",
  address: "",
};

// In the order the journey passes them.
export const nav = [
  { href: "#about", label: "About" },
  { href: "#products", label: "Products" },
  { href: "#strength", label: "Strength" },
  { href: "#visionary", label: "Visionary" },
  { href: "#vision", label: "Vision" },
  { href: "#markets", label: "Markets" },
];

// The journey rail: every section of the page, in scroll order.
export const chapters = [
  { id: "about", label: "About" },
  { id: "products", label: "Products" },
  { id: "strength", label: "Strength" },
  { id: "visionary", label: "Visionary" },
  { id: "vision", label: "Vision" },
  { id: "markets", label: "Markets" },
  { id: "ahead", label: "Looking Ahead" },
  { id: "contact", label: "Contact" },
];

export const about = {
  lead: "SAV Prime General Trading LLC is a Dubai-based international trading and commodities company engaged in the sourcing, supply, and distribution of a diverse range of industrial raw materials, minerals, energy products, fertilizers, and polymers across global markets.",
  body: [
    "The company was originally established as Minara General Trading LLC in 2021/2022 and, after two years of operations and expansion, was rebranded as SAV Prime General Trading LLC. The transition reflected the company’s growing international presence, expanding product portfolio, and broader vision for global commodities trading.",
    "What began with a strong focus on cement clinker and gypsum has evolved into a diversified commodities trading business with established networks across the Middle East, South Asia, and Africa.",
  ],
  timeline: [
    { when: "2021/2022", what: "Established as Minara General Trading LLC" },
    { when: "After two years", what: "Rebranded as SAV Prime General Trading LLC" },
    { when: "Today", what: "A diversified commodities trading business" },
  ],
};

export const products = {
  intro: "SAV Prime operates across several key commodity segments, including:",
  segments: [
    { name: "Cement & Construction Materials", items: ["Cement Clinker", "Gypsum"] },
    { name: "Minerals & Ores", items: ["Iron Ore", "Bauxite", "Other industrial minerals"] },
    {
      name: "Fertilizers & Industrial Materials",
      items: ["Urea", "Sulphur", "Other selected industrial commodities"],
    },
    { name: "Oil & Energy Products", items: ["Selected petroleum and energy-related products"] },
    { name: "Polymers & Plastics", items: ["HDPE", "LDPE", "Other polymer and plastic products"] },
    { name: "Metals & Agricultural Commodities", items: ["Metal Scrap", "Raw Cashew Nuts"] },
  ],
  note: "Our core strength includes the sourcing and international movement of bulk commodities, particularly cement clinker and gypsum, through bulk carrier shipments. Depending on the commodity and destination, we also facilitate containerized and other forms of international transportation.",
};

export const markets = {
  intro:
    "Headquartered in Dubai, United Arab Emirates, SAV Prime has developed an international trading network connecting producers, suppliers, traders, importers, distributors, and end users across multiple regions.",
  regions: [
    {
      name: "Middle East",
      countries: ["UAE", "Kuwait", "Oman", "Iraq", "Bahrain", "Saudi Arabia", "Qatar"],
    },
    { name: "South Asia", countries: ["India", "Sri Lanka", "Bangladesh", "Pakistan"] },
    { name: "Africa", countries: ["Guinea Conakry", "Senegal", "Ghana", "Ivory Coast"] },
  ],
  note: "In Africa, our activities include the sourcing and trading of metal scrap and raw cashew nuts, while our broader commodities network enables us to connect international sources of supply with established markets across Asia and the Middle East.",
};

export const strength = {
  lead: "At SAV Prime, we believe that successful international trading is built on trust, transparency, reliability, and long-term relationships.",
  values: ["Trust", "Transparency", "Reliability", "Long-term relationships"],
  body: [
    "Our strength lies in our ability to identify competitive sources, understand market requirements, coordinate international logistics, and connect reliable suppliers with genuine buyers.",
    "We work closely with producers, manufacturers, exporters, importers, distributors, and end users to develop efficient and dependable supply chains.",
    "Our experience across commodities, shipping, logistics, documentation, and regional markets allows us to approach each transaction with a practical understanding of the challenges involved in international trade.",
  ],
};

export const visionary = {
  name: "Apurva Voraa",
  role: "The visionary behind SAV Prime General Trading LLC",
  lead: "Apurva Voraa, the visionary behind SAV Prime General Trading LLC, has played a central role in driving the company’s growth, diversification, and international expansion.",
  body: [
    "Under his leadership, SAV Prime has evolved from its initial focus on cement clinker and gypsum into a diversified multi-commodity trading enterprise, expanding its product portfolio, geographic reach, and trading capabilities.",
    "With a strong focus on identifying emerging opportunities, developing international partnerships, and entering promising markets, Apurva Voraa continues to steer the company toward its next phase of growth.",
    "His vision is to build SAV Prime into a globally connected and professionally managed commodities trading platform capable of responding quickly to opportunities across multiple sectors and geographies.",
  ],
};

export const vision = {
  lead: "Our vision is to build SAV Prime into a trusted global commodities trading house, connecting producers and consumers across continents while creating sustainable value for our business partners.",
  body: [
    "We aim to continually expand our product portfolio, strengthen our global supply network, develop strategic partnerships, and enter new markets with a long-term approach.",
    "As global trade continues to evolve, we remain committed to being agile, commercially driven, and responsive to the changing needs of our customers and suppliers.",
  ],
};

export const ahead = {
  body: [
    "Today, SAV Prime General Trading LLC is a growing international commodities trading company with an expanding footprint across the Middle East, South Asia, and Africa.",
    "From our beginnings in cement clinker and gypsum, we have developed into a multi-commodity trading business covering minerals, construction materials, fertilizers, oil and energy products, polymers, metals, and agricultural commodities.",
    "We continue to explore new products, markets, and strategic opportunities while strengthening the relationships that form the foundation of our business.",
  ],
  objectiveLabel: "Our objective is simple:",
  objective:
    "To connect markets, move commodities efficiently, and build lasting relationships across the global trading landscape.",
};
